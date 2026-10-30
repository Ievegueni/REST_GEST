import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { createTenant } from '../../core/tenants';
import { normalizePhone } from '../../integrations/futurix-sms';
import { deleteTenants } from '../../test-utils';
import { postMovements } from '../stock/engine';
import { evaluateExpiry, evaluateMissingImports, evaluateStock, raise } from './engine';
import { quietDelay } from './jobs';

describe('horário de silêncio', () => {
  const at = (hhmm: string) => new Date(`2026-10-30T${hhmm}:00Z`); // UTC; Luanda = UTC+1
  it('janela que passa a meia-noite (22:00–07:00 Luanda)', () => {
    expect(quietDelay(at('22:30'), '22:00', '07:00')).toBe(7.5 * 3600_000); // 23:30 → 07:00
    expect(quietDelay(at('05:00'), '22:00', '07:00')).toBe(3600_000); // 06:00 → 07:00
    expect(quietDelay(at('12:00'), '22:00', '07:00')).toBe(0);
    expect(quietDelay(at('12:00'), null, null)).toBe(0);
  });
});

it('normaliza telemóveis angolanos', () => {
  expect(normalizePhone('923 456 789')).toBe('+244923456789');
  expect(normalizePhone('+244 923456789')).toBe('+244923456789');
  expect(normalizePhone('12345')).toBeNull();
});

const app = await buildApp();
let tenantId = '';
let db: ReturnType<typeof tenantDb>;
const ids = {
  unitA: '',
  unitB: '',
  barA: '',
  barB: '',
  gf: '',
  cat: '',
  admin: '',
  ecoA: '',
  ecoB: '',
};
let seq = 0;

beforeAll(async () => {
  const { tenant, admin } = await createTenant({
    name: `Alertas ${Date.now()}`,
    plan: 'STOCK',
    admin: {
      name: 'Admin',
      email: `alert-admin-${Date.now()}@test.local`,
      password: 'password123',
      phone: '923000001',
    },
  });
  tenantId = tenant.id;
  db = tenantDb(tenantId);
  ids.admin = admin.id;
  ids.unitA = (await db.unit.create({ data: { name: 'A' } })).id;
  ids.unitB = (await db.unit.create({ data: { name: 'B' } })).id;
  ids.barA = (await db.stockLocation.create({ data: { unitId: ids.unitA, name: 'Bar A' } })).id;
  ids.barB = (await db.stockLocation.create({ data: { unitId: ids.unitB, name: 'Bar B' } })).id;
  ids.gf = (await db.measureUnit.findFirstOrThrow({ where: { symbol: 'gf' } })).id;
  ids.cat = (await db.category.create({ data: { name: 'Bebidas' } })).id;
  const eco = await db.role.findFirstOrThrow({ where: { name: 'Ecónomo' } });
  const hash = await argon2.hash('password123');
  const mkUser = async (name: string, unitId: string, phone: string | null) => {
    const u = await db.user.create({
      data: {
        name,
        email: `${name.toLowerCase()}-${tenantId}@test.local`,
        passwordHash: hash,
        roleId: eco.id,
        phone,
      },
    });
    await db.userUnit.create({ data: { userId: u.id, unitId } });
    return u.id;
  };
  ids.ecoA = await mkUser('ecoA', ids.unitA, '923000002');
  ids.ecoB = await mkUser('ecoB', ids.unitB, null);
});

beforeEach(async () => {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { smsDigest: false, smsMonthlyLimit: null },
  });
});

afterAll(async () => {
  await deleteTenants([tenantId]);
  await app.close();
  await prisma.$disconnect();
});

async function product(min: number | null, max: number | null = null, tracksLots = false) {
  const p = await db.product.create({
    data: {
      code: `AL${++seq}`,
      name: `Produto ${seq}`,
      categoryId: ids.cat,
      stockUnitId: ids.gf,
      tracksLots,
    },
  });
  if (min != null || max != null)
    await db.productLocationLimit.create({
      data: { productId: p.id, locationId: ids.barA, minQty: min, maxQty: max },
    });
  return p.id;
}
const move = (productId: string, type: 'PURCHASE_IN' | 'CONSUMPTION', qty: number, extra = {}) =>
  db.$transaction((tx) =>
    postMovements(
      tx,
      [
        {
          productId,
          locationId: ids.barA,
          type,
          qty,
          unitCost: type === 'PURCHASE_IN' ? 100 : null,
          ...extra,
        },
      ],
      { tenantId, userId: ids.admin },
    ),
  );
const check = (productId: string) =>
  evaluateStock(db, tenantId, [{ productId, locationId: ids.barA }]);
const openAlerts = (key: string) =>
  db.alert.findMany({ where: { key: { contains: key }, status: 'OPEN' } });

describe('stock mínimo, rotura e máximo', () => {
  it('abre alerta abaixo do mínimo para Admin e Ecónomo da unidade (não o de outra unidade)', async () => {
    const p = await product(10);
    await move(p, 'PURCHASE_IN', 5);
    await check(p);
    const [alert] = await openAlerts(p);
    expect(alert).toMatchObject({ type: 'STOCK_BELOW_MIN', unitId: ids.unitA });
    expect(alert!.message).toContain('5 gf (mín. 10)');

    const notified = (await db.notification.findMany({ where: { alertId: alert!.id } }))
      .map((n) => n.userId)
      .sort();
    expect(notified).toEqual([ids.admin, ids.ecoA].sort());

    // SMS: sem Futurix configurado ficam registados como não enviados
    const sms = await db.smsLog.findMany({ where: { alertId: alert!.id } });
    expect(sms.map((s) => [s.to, s.status])).toEqual(
      expect.arrayContaining([['+244923000002', 'SKIPPED']]),
    );
    expect(sms[0]!.error).toContain('não configurado');
  });

  it('não repete o alerta enquanto o estado não muda e resolve ao repor', async () => {
    const p = await product(10);
    await move(p, 'PURCHASE_IN', 5);
    await check(p);
    await check(p);
    expect(await openAlerts(p)).toHaveLength(1);
    await move(p, 'PURCHASE_IN', 10);
    await check(p);
    expect(await openAlerts(p)).toHaveLength(0);
  });

  it('rotura e acima do máximo', async () => {
    const p = await product(2, 20);
    await move(p, 'PURCHASE_IN', 30);
    await check(p);
    expect((await openAlerts(p)).map((a) => a.type)).toEqual(['STOCK_ABOVE_MAX']);
    await move(p, 'CONSUMPTION', 30);
    await check(p);
    expect((await openAlerts(p)).map((a) => a.type)).toEqual(['STOCK_OUT']);
  });

  it('regra desligada não abre alertas', async () => {
    await db.alertRule.create({
      data: { type: 'STOCK_ABOVE_MAX', enabled: false, sms: false, recipientRoleIds: [] },
    });
    const p = await product(null, 1);
    await move(p, 'PURCHASE_IN', 5);
    await check(p);
    expect(await openAlerts(p)).toHaveLength(0);
  });
});

describe('outros alertas', () => {
  it('validade próxima conforme o limiar em dias, resolvida quando o lote acaba', async () => {
    const p = await product(null, null, true);
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const later = new Date(Date.now() + 60 * 86_400_000);
    await move(p, 'PURCHASE_IN', 2, { lot: { code: 'L-SOON', expiryDate: soon } });
    await move(p, 'PURCHASE_IN', 2, { lot: { code: 'L-LATER', expiryDate: later } });
    await evaluateExpiry(db, tenantId);
    const open = await db.alert.findMany({ where: { type: 'EXPIRY_NEAR', status: 'OPEN' } });
    expect(open).toHaveLength(1);
    expect(open[0]!.message).toContain('L-SOON');
    await move(p, 'CONSUMPTION', 2); // FEFO consome L-SOON
    await evaluateExpiry(db, tenantId);
    expect(await db.alert.count({ where: { type: 'EXPIRY_NEAR', status: 'OPEN' } })).toBe(0);
  });

  it('dia sem vendas importadas (só quando há perfis de importação)', async () => {
    await evaluateMissingImports(db, tenantId);
    expect(await db.alert.count({ where: { type: 'SALES_IMPORT_MISSING' } })).toBe(0);
    await db.importProfile.create({
      data: { name: 'P', posName: 'POS', columns: { itemCode: 'A', qty: 'B' } },
    });
    await evaluateMissingImports(db, tenantId, new Date('2026-10-30T10:00:00Z'));
    const open = await db.alert.findMany({
      where: { type: 'SALES_IMPORT_MISSING', status: 'OPEN' },
    });
    expect(open.map((a) => a.message).sort()).toEqual([
      'Sem vendas importadas em A no dia 29/10/2026',
      'Sem vendas importadas em B no dia 29/10/2026',
    ]);
  });
});

describe('SMS', () => {
  it('limite mensal do plano', async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { smsMonthlyLimit: 0 } });
    const a = await raise(db, tenantId, {
      type: 'STOCK_OUT',
      key: `t-limit-${Date.now()}`,
      unitId: ids.unitA,
      message: 'x',
    });
    const sms = await db.smsLog.findMany({ where: { alertId: a!.id, status: 'SKIPPED' } });
    expect(sms.some((s) => s.error?.includes('Limite mensal'))).toBe(true);
  });

  it('com resumo diário, não envia SMS por alerta', async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { smsDigest: true } });
    const a = await raise(db, tenantId, {
      type: 'STOCK_OUT',
      key: `t-digest-${Date.now()}`,
      unitId: ids.unitA,
      message: 'y',
    });
    expect(await db.smsLog.count({ where: { alertId: a!.id } })).toBe(0);
    expect(await db.notification.count({ where: { alertId: a!.id } })).toBeGreaterThan(0);
  });
});

describe('API', () => {
  it('sino: não lidas e marcar como lidas; centro filtra pela unidade', async () => {
    const login = async (email: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email, password: 'password123' },
        })
      ).json().data.accessToken;
    const ecoB = await db.user.findUniqueOrThrow({ where: { id: ids.ecoB } });

    const token = await login(ecoB.email);
    const get = (url: string) => app.inject({ url, headers: { authorization: `Bearer ${token}` } });
    const before = (await get('/api/notifications')).json().data.unread;
    await raise(db, tenantId, {
      type: 'STOCK_OUT',
      key: `t-b-${Date.now()}`,
      unitId: ids.unitB,
      message: 'Só B',
    });
    const n = (await get('/api/notifications')).json().data;
    expect(n.unread).toBe(before + 1);
    expect(n.items[0].title).toBe('Só B');
    await app.inject({
      method: 'POST',
      url: '/api/notifications/read',
      payload: {},
      headers: { authorization: `Bearer ${token}` },
    });
    expect((await get('/api/notifications')).json().data.unread).toBe(0);

    const alerts = (await get('/api/alerts')).json().data as { unitId: string | null }[];
    expect(alerts.every((a) => a.unitId === ids.unitB || a.unitId === null)).toBe(true);
    expect((await get('/api/alert-rules')).statusCode).toBe(403); // Ecónomo sem alerts.manage
  });
});
