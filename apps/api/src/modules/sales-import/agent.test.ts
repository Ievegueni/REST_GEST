import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;
let key = '';
const ids = { gf: '', drinks: '', bar: '', beer: '', beerItem: '', mc: '', nu: '' };
const DAY = '2026-11-03';

const agent = (method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url: `/api/pos-agent${url}`, headers: { 'x-agent-key': key }, payload });
const send = (docs: object[], cancelled: string[] = [], cursor: string | null = null) =>
  agent('POST', '/sales', { posName: 'Winrest', cursor, docs, cancelled });
const doc = (id: string, over: object = {}) => ({
  id,
  number: `FR ${id}`,
  table: '6',
  businessDate: DAY,
  closedAt: `${DAY}T14:00:00Z`,
  total: 5000,
  lines: [
    { code: '62', label: 'Cerveja', qty: 2, amount: 4672, gross: 5000 },
    { code: 'X1', label: 'Sem mapeamento', qty: 1, amount: 935, gross: 1000 },
  ],
  payments: [{ code: 'MC', name: 'Multi Caixa', amount: 6000 }],
  ...over,
});
const stock = async () =>
  (
    await db.stockBalance.findUnique({
      where: { productId_locationId: { productId: ids.beer, locationId: ids.bar } },
    })
  )?.qty.toNumber();
const revenue = async () =>
  (await api('GET', `/api/financial/summary?from=${DAY}&to=${DAY}`)).json().data.total.revenue;

beforeAll(async () => {
  T = await createTestTenant({ name: 'Agt', perms: [...PERMISSIONS], plan: 'COMPLETO' });
  db = tenantDb(T.tenant.id);
  api = await clientFor(app, T.email);
  ids.gf = (await db.measureUnit.create({ data: { name: 'gf', symbol: 'gf' } })).id;
  ids.drinks = (await db.category.create({ data: { name: 'Bebidas' } })).id;
  ids.bar = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Bar' } })).id;
  ids.beer = (
    await db.product.create({
      data: { code: 'CERV', name: 'Cerveja', categoryId: ids.drinks, stockUnitId: ids.gf },
    })
  ).id;
  await api('POST', '/api/stock/movements', {
    locationId: ids.bar,
    items: [{ productId: ids.beer, type: 'PURCHASE_IN', qty: 48, unitCost: 300 }],
  });
  ids.beerItem = (
    await api('POST', '/api/sale-items', {
      code: 'CERV',
      name: 'Cerveja',
      salePrice: 2500,
      lines: [{ productId: ids.beer, qty: 1 }],
    })
  ).json().data.id;
  await api('PUT', '/api/pos-mappings', {
    posName: 'Winrest',
    posCode: '62',
    saleItemId: ids.beerItem,
  });
  await api('PUT', '/api/category-output-locations', [
    { categoryId: ids.drinks, unitId: T.unit.id, locationId: ids.bar },
  ]);
  ids.mc = (
    await api('POST', '/api/payment-methods', { name: 'TPA', posCode: 'mc' })
  ).json().data.id;
  ids.nu = (
    await api('POST', '/api/payment-methods', { name: 'Numerário', isCash: true, posCode: 'NU' })
  ).json().data.id;
  key = (await api('POST', `/api/units/${T.unit.id}/pos-agent-key`)).json().data.key;
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('vendas em tempo real (agente POS)', () => {
  it('factura fechada: receita sem IVA, stock pela ficha, artigo sem mapeamento fica pendente', async () => {
    expect((await agent('GET', '/sales/cursor')).json().data.cursor).toBeNull();
    const res = await send([doc('D1')], [], '1001');
    console.log(
      'DEBUG',
      JSON.stringify(await db.salesImport.findMany({ select: { errors: true, status: true } })),
    );
    expect(res.json().data).toEqual({ accepted: 1, duplicates: 0, cancelled: 0, skippedDays: [] });
    expect(await stock()).toBe(46);
    expect(await revenue()).toBe(4672 + 935);
    const imp = await db.salesImport.findFirstOrThrow({
      where: { fileHash: { startsWith: 'agent:' } },
    });
    expect(imp).toMatchObject({ status: 'CONFIRMED', rowCount: 2, totalAmount: 5607 });
    const view = (await api('GET', `/api/sales-imports/${imp.id}`)).json().data;
    expect(view.pendingLines).toBe(1); // X1
    expect((await agent('GET', '/sales/cursor')).json().data.cursor).toBe('1001');
  });

  it('reenvio da mesma factura não duplica', async () => {
    expect((await send([doc('D1')])).json().data).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(await stock()).toBe(46);
    expect(await revenue()).toBe(5607);
  });

  it('consumo interno: baixa stock, sem receita', async () => {
    await send([
      doc('D2', {
        internal: true,
        lines: [{ code: '62', label: 'Cerveja', qty: 1, amount: 2336, gross: 2500 }],
        payments: [{ code: 'CI', name: 'Consumo Interno', amount: 2500 }],
      }),
    ]);
    expect(await stock()).toBe(45);
    expect(await revenue()).toBe(5607);
  });

  it('factura anulada depois de fechada: estorna receita e stock (uma só vez)', async () => {
    await send([
      doc('D3', {
        lines: [{ code: '62', label: 'Cerveja', qty: 4, amount: 9346, gross: 10000 }],
        payments: [{ code: 'NU', name: 'Cash', amount: 10000 }],
      }),
    ]);
    expect(await stock()).toBe(41);
    expect(await revenue()).toBe(5607 + 9346);
    expect((await send([], ['D3', 'NAO-EXISTE'])).json().data.cancelled).toBe(1);
    expect((await send([], ['D3'])).json().data.cancelled).toBe(0);
    expect(await stock()).toBe(45);
    expect(await revenue()).toBe(5607);
  });

  it('fecho de caixa: valores do sistema a partir dos pagamentos do POS', async () => {
    const s = (
      await api('POST', '/api/cash-sessions', {
        unitId: T.unit.id,
        businessDate: DAY,
        openingFloat: 0,
      })
    ).json().data;
    const res = (await api('POST', `/api/cash-sessions/${s.id}/pos-amounts`)).json().data;
    const sys = Object.fromEntries(
      res.lines.map((l: { paymentMethod: { id: string }; systemAmount: number }) => [
        l.paymentMethod.id,
        l.systemAmount,
      ]),
    );
    expect(sys[ids.mc]).toBe(6000);
    expect(sys[ids.nu]).toBe(0); // D3 foi anulada
    expect(res.posUnmapped).toEqual(['CI']);
  });

  it('dia já importado por ficheiro: vendas do agente desse dia não entram', async () => {
    const other = await db.importProfile.create({
      data: { name: 'Excel', posName: 'Winrest', columns: {} },
    });
    await db.salesImport.create({
      data: {
        number: 999,
        unitId: T.unit.id,
        profileId: other.id,
        fileName: 'vendas.xlsx',
        fileHash: 'x',
        status: 'CONFIRMED',
        periodFrom: new Date('2026-11-04'),
        periodTo: new Date('2026-11-04'),
        createdById: T.user.id,
      },
    });
    const res = (await send([doc('D4', { businessDate: '2026-11-04' })])).json().data;
    expect(res).toMatchObject({ accepted: 0, skippedDays: ['2026-11-04'] });
    expect(await stock()).toBe(45);
  });

  it('chave inválida → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos-agent/sales',
      headers: { 'x-agent-key': 'rga_x' },
      payload: { posName: 'Winrest', cursor: null, docs: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});
