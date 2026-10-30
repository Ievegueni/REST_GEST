import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';
import { evaluatePayables } from '../alerts/engine';

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;
const ids = { supplier: '', product: '', loc: '', receipt: '', payable: '' };

beforeAll(async () => {
  T = await createTestTenant({ name: 'Pag', plan: 'COMPLETO', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  api = await clientFor(app, T.email);
  ids.supplier = (
    await db.supplier.create({ data: { name: 'Fornecedor A', paymentTermDays: 30 } })
  ).id;
  const gf = (await db.measureUnit.create({ data: { name: 'gf', symbol: 'gf' } })).id;
  const cat = (await db.category.create({ data: { name: 'Bebidas' } })).id;
  ids.product = (
    await db.product.create({ data: { code: 'X', name: 'X', categoryId: cat, stockUnitId: gf } })
  ).id;
  ids.loc = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Armazém' } })).id;
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('contas a pagar', () => {
  it('a recepção gera a conta com vencimento = data da factura + prazo do fornecedor', async () => {
    const gf = (await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stockUnitId;
    const r = await api('POST', '/api/goods-receipts', {
      supplierId: ids.supplier,
      locationId: ids.loc,
      invoiceNumber: 'FT 9/1',
      invoiceDate: '2026-10-01',
      lines: [{ productId: ids.product, unitId: gf, qty: 10, unitPrice: 1000 }],
    });
    ids.receipt = r.json().data.id;
    const p = await db.payable.findFirstOrThrow({ where: { receiptId: ids.receipt } });
    ids.payable = p.id;
    expect(p).toMatchObject({ amount: 10000, status: 'OPEN', documentNumber: 'FT 9/1' });
    expect(p.dueDate.toISOString().slice(0, 10)).toBe('2026-10-31');
  });

  it('pagamentos parciais e totais; não paga acima do saldo', async () => {
    const pay = (amount: number) =>
      api('POST', `/api/payables/${ids.payable}/payments`, { date: '2026-10-15', amount });
    expect((await pay(4000)).json().data.status).toBe('PARTIAL');
    expect((await pay(7000)).statusCode).toBe(400);
    expect((await pay(6000)).json().data).toMatchObject({ status: 'PAID', paidAmount: 10000 });
  });

  it('não anula a recepção com pagamentos; sem pagamentos cancela a conta', async () => {
    expect((await api('POST', `/api/goods-receipts/${ids.receipt}/cancel`)).statusCode).toBe(400);
    const p = (await api('GET', `/api/payables/${ids.payable}`)).json().data;
    for (const x of p.payments)
      await api('DELETE', `/api/payables/${ids.payable}/payments/${x.id}`);
    expect((await api('POST', `/api/goods-receipts/${ids.receipt}/cancel`)).statusCode).toBe(200);
    expect((await db.payable.findUniqueOrThrow({ where: { id: ids.payable } })).status).toBe(
      'CANCELLED',
    );
  });

  it('conta manual, alertas a vencer/vencida e relatórios', async () => {
    const mk = (issueDate: string, amount: number, dueDate?: string) =>
      api('POST', '/api/payables', {
        supplierId: ids.supplier,
        unitId: T.unit.id,
        issueDate,
        ...(dueDate && { dueDate }),
        amount,
        description: 'Manual',
      });
    expect((await mk('2026-09-01', 5000)).json().data.dueDate.slice(0, 10)).toBe('2026-10-01'); // prazo do fornecedor
    await mk('2026-11-01', 3000, '2026-11-02');
    await mk('2026-06-01', 2000, '2026-07-01');

    await evaluatePayables(db, T.tenant.id, new Date('2026-10-31T10:00:00Z'));
    const alerts = await db.alert.findMany({
      where: { status: 'OPEN', type: { in: ['PAYABLE_DUE', 'PAYABLE_OVERDUE'] } },
    });
    expect(alerts.map((a) => a.type).sort()).toEqual([
      'PAYABLE_DUE',
      'PAYABLE_OVERDUE',
      'PAYABLE_OVERDUE',
    ]);

    const aging = (await api('GET', '/api/reports/payables-aging?to=2026-10-31')).json().data;
    expect(aging.rows[0]).toMatchObject({
      supplier: 'Fornecedor A',
      notDue: 3000,
      d30: 5000,
      d60: 0,
      d90: 0,
      d90plus: 2000,
      total: 10000,
    });
    const forecast = (await api('GET', '/api/reports/payables-forecast?to=2026-10-31')).json().data;
    expect(forecast.rows[0]).toMatchObject({ week: 'Vencidas', count: 2, amount: 7000 });
  });

  it('relatórios de contas a pagar não existem no plano STOCK', async () => {
    const s = await createTestTenant({ name: 'PagStock', plan: 'STOCK', perms: [...PERMISSIONS] });
    const sApi = await clientFor(app, s.email);
    const list = (await sApi('GET', '/api/reports'))
      .json()
      .data.map((r: { name: string }) => r.name);
    expect(list).not.toContain('payables-aging');
    expect((await sApi('GET', '/api/reports/payables-aging')).json().error.code).toBe(
      'FEATURE_NOT_IN_PLAN',
    );
    await deleteTenants([s.tenant.id]);
  });
});
