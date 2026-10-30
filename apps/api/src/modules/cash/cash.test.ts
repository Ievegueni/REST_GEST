import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';
import { generateRecurring } from '../costs/service';

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;
let cashier: Awaited<ReturnType<typeof clientFor>>;
const ids = { cash: '', tpa: '', cat: '', session: '' };

beforeAll(async () => {
  T = await createTestTenant({ name: 'Cash', plan: 'COMPLETO', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  api = await clientFor(app, T.email);
  const role = await db.role.create({
    data: { name: 'Caixa t', permissions: { connect: [{ code: 'cash.close' }] } },
  });
  const u = await db.user.create({
    data: {
      name: 'c',
      email: `cx-${T.tenant.id}@test.local`,
      passwordHash: await argon2.hash('password123'),
      roleId: role.id,
      allUnits: true,
    },
  });
  cashier = await clientFor(app, u.email);
  ids.cash = (
    await api('POST', '/api/payment-methods', { name: 'Numerário', isCash: true })
  ).json().data.id;
  ids.tpa = (await api('POST', '/api/payment-methods', { name: 'TPA' })).json().data.id;
  ids.cat = (await api('POST', '/api/cost-categories', { name: 'Limpeza' })).json().data.id;
  await api('PATCH', '/api/settings', { cashDifferenceLimit: 1000 });
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('custos diários', () => {
  it('regista custo e gera recorrentes uma só vez por mês', async () => {
    const c = await api('POST', '/api/daily-costs', {
      unitId: T.unit.id,
      date: '2026-10-02',
      categoryId: ids.cat,
      amount: 15000,
      paymentMethodId: ids.tpa,
    });
    expect(c.statusCode).toBe(201);
    await api('POST', '/api/recurring-costs', {
      unitId: T.unit.id,
      categoryId: ids.cat,
      description: 'Renda',
      amount: 500000,
      dayOfMonth: 5,
    });
    expect(await generateRecurring(T.tenant.id, '2026-10-04')).toBe(0); // ainda não chegou o dia
    expect(await generateRecurring(T.tenant.id, '2026-10-10')).toBe(1);
    expect(await generateRecurring(T.tenant.id, '2026-10-20')).toBe(0);
    expect(await generateRecurring(T.tenant.id, '2026-11-05')).toBe(1);
    const rent = await db.dailyCost.findMany({
      where: { description: 'Renda' },
      orderBy: { date: 'asc' },
    });
    expect(rent.map((r) => r.date.toISOString().slice(0, 10))).toEqual([
      '2026-10-05',
      '2026-11-05',
    ]);
  });
});

describe('fecho de caixa', () => {
  it('abre a sessão (uma por unidade/dia/turno)', async () => {
    const body = {
      unitId: T.unit.id,
      businessDate: '2026-10-30',
      shift: 'Noite',
      openingFloat: 20000,
    };
    const res = await cashier('POST', '/api/cash-sessions', body);
    expect(res.statusCode).toBe(201);
    ids.session = res.json().data.id;
    expect((await cashier('POST', '/api/cash-sessions', body)).statusCode).toBe(409);
  });

  it('numerário esperado = fundo + vendas + entradas − sangrias − pagamentos; pagamento gera custo', async () => {
    const s = ids.session;
    await cashier('PUT', `/api/cash-sessions/${s}/amounts`, {
      amounts: [
        { paymentMethodId: ids.cash, systemAmount: 100000 },
        { paymentMethodId: ids.tpa, systemAmount: 50000 },
      ],
    });
    await cashier('POST', `/api/cash-sessions/${s}/movements`, {
      type: 'WITHDRAWAL',
      amount: 60000,
      description: 'Cofre',
    });
    await cashier('POST', `/api/cash-sessions/${s}/movements`, {
      type: 'DEPOSIT',
      amount: 5000,
      description: 'Trocos',
    });
    expect(
      (
        await cashier('POST', `/api/cash-sessions/${s}/movements`, {
          type: 'EXPENSE',
          amount: 3000,
          description: 'Gelo',
        })
      ).statusCode,
    ).toBe(400); // sem categoria
    const r = await cashier('POST', `/api/cash-sessions/${s}/movements`, {
      type: 'EXPENSE',
      amount: 3000,
      description: 'Gelo',
      categoryId: ids.cat,
    });
    expect(r.json().data.summary).toMatchObject({
      expectedCash: 62000,
      withdrawals: 60000,
      deposits: 5000,
      expenses: 3000,
    });
    const cost = await db.dailyCost.findFirstOrThrow({ where: { cashSessionId: s } });
    expect(cost).toMatchObject({ amount: 3000, description: 'Gelo' });
  });

  it('fecho exige contagem; acima do limite exige justificação e abre alerta', async () => {
    const s = ids.session;
    expect((await cashier('POST', `/api/cash-sessions/${s}/close`, {})).statusCode).toBe(400); // sem contagem
    await cashier('PUT', `/api/cash-sessions/${s}/amounts`, {
      amounts: [
        { paymentMethodId: ids.cash, countedAmount: 59000 },
        { paymentMethodId: ids.tpa, countedAmount: 50000 },
      ],
    });
    const noJust = await cashier('POST', `/api/cash-sessions/${s}/close`, {});
    expect(noJust.json().error.message).toContain('justificação');
    const closed = (
      await cashier('POST', `/api/cash-sessions/${s}/close`, { justification: 'Troco mal dado' })
    ).json().data;
    expect(closed).toMatchObject({ status: 'CLOSED', difference: -3000 });
    const alert = await db.alert.findFirstOrThrow({ where: { type: 'CASH_DIFFERENCE' } });
    expect(alert.message).toContain('Troco mal dado');
    // fechada não aceita alterações
    expect(
      (
        await cashier('POST', `/api/cash-sessions/${s}/movements`, {
          type: 'DEPOSIT',
          amount: 1,
          description: 'x',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('validação só pelo gerente; validada é imutável', async () => {
    const s = ids.session;
    expect((await cashier('POST', `/api/cash-sessions/${s}/validate`)).statusCode).toBe(403);
    expect((await api('POST', `/api/cash-sessions/${s}/validate`)).json().data.status).toBe(
      'VALIDATED',
    );
    expect((await api('POST', `/api/cash-sessions/${s}/reopen`)).statusCode).toBe(400);
    expect(
      (
        await api(
          'DELETE',
          `/api/daily-costs/${(await db.dailyCost.findFirstOrThrow({ where: { cashSessionId: s } })).id}`,
        )
      ).statusCode,
    ).toBe(400);
  });

  it('sem cash.close nem cash.validate não vê o caixa', async () => {
    const role = await db.role.create({
      data: { name: 'Nada', permissions: { connect: [{ code: 'reports.view' }] } },
    });
    const u = await db.user.create({
      data: {
        name: 'n',
        email: `n-${T.tenant.id}@test.local`,
        passwordHash: await argon2.hash('password123'),
        roleId: role.id,
        allUnits: true,
      },
    });
    const none = await clientFor(app, u.email);
    expect((await none('GET', '/api/cash-sessions')).statusCode).toBe(403);
  });
});
