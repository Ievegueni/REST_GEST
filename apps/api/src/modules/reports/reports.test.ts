import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';
import { postMovements, type MovementInput } from '../stock/engine';
import { forecast } from './replenishment';
import { todayLocal } from './common';

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;
let token = '';
const ids = {
  gf: '',
  cx: '',
  drinks: '',
  food: '',
  bar: '',
  unit2: '',
  bar2: '',
  beer: '',
  water: '',
  meat: '',
  supplier: '',
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const post = (inputs: MovementInput[], occurredAt?: Date) =>
  db.$transaction((tx) =>
    postMovements(tx, inputs, { tenantId: T.tenant.id, userId: T.user.id, occurredAt }),
  );
const report = async (name: string, qs = '') =>
  (await api('GET', `/api/reports/${name}${qs ? `?${qs}` : ''}`)).json().data;

beforeAll(async () => {
  T = await createTestTenant({ name: 'Rep', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  ids.gf = (await db.measureUnit.create({ data: { name: 'gf', symbol: 'gf' } })).id;
  ids.cx = (await db.measureUnit.create({ data: { name: 'cx', symbol: 'cx' } })).id;
  ids.drinks = (await db.category.create({ data: { name: 'Bebidas' } })).id;
  ids.food = (await db.category.create({ data: { name: 'Alimentos' } })).id;
  ids.bar = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Bar' } })).id;
  ids.unit2 = (await db.unit.create({ data: { name: 'Praia' } })).id;
  ids.bar2 = (await db.stockLocation.create({ data: { unitId: ids.unit2, name: 'Bar P' } })).id;
  ids.supplier = (await db.supplier.create({ data: { name: 'Distribuidora' } })).id;
  const prod = async (code: string, categoryId: string, extra = {}) =>
    (
      await db.product.create({
        data: { code, name: code, categoryId, stockUnitId: ids.gf, ...extra },
      })
    ).id;
  ids.beer = await prod('CERV', ids.drinks, {
    purchaseUnitId: ids.cx,
    preferredSupplierId: ids.supplier,
  });
  await db.productUnitConversion.create({
    data: { productId: ids.beer, unitId: ids.cx, factor: 24 },
  });
  ids.water = await prod('AGUA', ids.drinks);
  ids.meat = await prod('CARNE', ids.food);

  api = await clientFor(app, T.email);
  token = (
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: T.email, password: 'password123' },
    })
  ).json().data.accessToken;

  // Compras: cerveja 2 cx a 4800 (200/gf), depois 1 cx a 7200 (300/gf)
  for (const [qty, price, ago] of [
    [2, 4800, 20],
    [1, 7200, 10],
  ] as const) {
    await api('POST', '/api/goods-receipts', {
      supplierId: ids.supplier,
      locationId: ids.bar,
      receivedAt: daysAgo(ago).toISOString(),
      lines: [{ productId: ids.beer, unitId: ids.cx, qty, unitPrice: price }],
    });
  }
  await post(
    [{ productId: ids.water, locationId: ids.bar, type: 'PURCHASE_IN', qty: 50, unitCost: 100 }],
    daysAgo(25),
  );
  await post(
    [{ productId: ids.meat, locationId: ids.bar2, type: 'PURCHASE_IN', qty: 10, unitCost: 1000 }],
    daysAgo(25),
  );
  // Consumo da cerveja: 2 gf por dia nos últimos 14 dias
  for (let d = 14; d >= 1; d--)
    await post(
      [{ productId: ids.beer, locationId: ids.bar, type: 'SALE_OUT', qty: 2 }],
      daysAgo(d),
    );
  await post(
    [{ productId: ids.meat, locationId: ids.bar2, type: 'CONSUMPTION', qty: 1 }],
    daysAgo(3),
  );
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('relatórios', () => {
  it('stock actual por local e consolidado por produto', async () => {
    const r = await report('stock');
    const beer = r.rows.find((x: { code: string }) => x.code === 'CERV');
    expect(beer).toMatchObject({ qty: 44, avgCost: 233.33 }); // 72 − 28; média (48×200 + 24×300)/72
    expect(r.totals.value).toBe(r.rows.reduce((s: number, x: { value: number }) => s + x.value, 0));
    const byProduct = await report('stock', 'group=product');
    expect(byProduct.columns.some((c: { key: string }) => c.key === 'location')).toBe(false);
  });

  it('consumo por produto e por categoria', async () => {
    const r = await report('consumption');
    expect(r.rows.map((x: { code: string; qty: number }) => [x.code, x.qty])).toEqual([
      ['CERV', 28],
      ['CARNE', 1],
    ]);
    const cat = await report('consumption', 'group=category');
    expect(cat.rows.map((x: { category: string }) => x.category)).toEqual(['Bebidas', 'Alimentos']);
  });

  it('rotação, cobertura e produtos parados', async () => {
    const r = await report('rotation', 'unitId=' + T.unit.id);
    const beer = r.rows.find((x: { code: string }) => x.code === 'CERV');
    expect(beer.daily).toBeCloseTo(28 / 30, 3);
    expect(beer.coverage).toBeCloseTo(44 / (28 / 30), 0);
    const stagnant = await report('rotation', 'stagnantOnly=true');
    expect(stagnant.rows.map((x: { code: string }) => x.code)).toEqual(['AGUA']);
  });

  it('compras por fornecedor e evolução de preços por unidade de stock', async () => {
    const r = await report('purchases-by-supplier');
    expect(r.rows[0]).toMatchObject({
      supplier: 'Distribuidora',
      receipts: 2,
      total: 16800,
      share: 100,
    });
    const p = await report('price-evolution', `productId=${ids.beer}`);
    expect(p.rows.map((x: { stockPrice: number }) => x.stockPrice)).toEqual([200, 300]);
  });

  it('curva ABC', async () => {
    const r = await report('abc');
    expect(r.rows.map((x: { code: string; class: string }) => [x.code, x.class])).toEqual([
      ['CERV', 'A'],
      ['CARNE', 'B'], // começa acima de 80% e abaixo de 95% do acumulado
    ]);
  });

  it('comparativo entre unidades e utilizador restrito só vê a sua', async () => {
    const r = await report('units-comparison');
    expect(r.rows.map((x: { unit: string }) => x.unit).sort()).toEqual(['Praia', 'Rep unidade']);
    const role = await db.role.findFirstOrThrow();
    await api('POST', '/api/users', {
      name: 'R',
      email: `r-${T.tenant.id}@test.local`,
      password: 'password123',
      roleId: role.id,
      unitIds: [ids.unit2],
    });
    const restricted = await clientFor(app, `r-${T.tenant.id}@test.local`);
    const rr = (await restricted('GET', '/api/reports/units-comparison')).json().data;
    expect(rr.rows.map((x: { unit: string }) => x.unit)).toEqual(['Praia']);
    expect((await restricted('GET', `/api/reports/stock?unitId=${T.unit.id}`)).statusCode).toBe(
      403,
    );
  });

  it('quebras por motivo, com motivos configurados obrigatórios', async () => {
    await api('POST', '/api/waste-reasons', { name: 'Garrafa partida' });
    const bad = await api('POST', '/api/stock/movements', {
      locationId: ids.bar,
      items: [{ productId: ids.water, type: 'WASTE', qty: 1, reason: 'outro' }],
    });
    expect(bad.statusCode).toBe(400);
    const ok = await api('POST', '/api/stock/movements', {
      locationId: ids.bar,
      items: [{ productId: ids.water, type: 'WASTE', qty: 2, reason: 'Garrafa partida' }],
    });
    expect(ok.statusCode).toBe(201);
    const r = await report('waste');
    expect(r.rows[0]).toMatchObject({ reason: 'Garrafa partida', qty: 2, value: 200, count: 1 });
  });

  it('exporta Excel e PDF', async () => {
    const xlsx = await app.inject({
      url: '/api/reports/consumption?format=xlsx',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets[0]!.getCell('A1').value).toBe('Consumo');
    expect(wb.worksheets[0]!.getCell('A2').value).toContain('Período:');

    const pdf = await app.inject({
      url: '/api/reports/stock?format=pdf',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('sugestão de reposição', () => {
  it('previsão por dia da semana', () => {
    const history = ['2026-10-19', '2026-10-20', '2026-10-26', '2026-10-27']; // seg, ter, seg, ter
    const byDow = new Map([
      [1, 10],
      [2, 4],
    ]); // total por dia da semana no histórico
    expect(forecast(byDow, history, ['2026-11-02', '2026-11-03', '2026-11-04'])).toBe(5 + 2 + 0);
  });

  it('sugere caixas para cobrir o consumo e gera encomenda por fornecedor', async () => {
    const s = (
      await api('GET', `/api/replenishment?unitId=${T.unit.id}&coverageDays=30&lookbackDays=14`)
    ).json().data;
    const beer = s.find((x: { code: string }) => x.code === 'CERV');
    // 2 gf/dia × 30 dias = 60; stock 44 → faltam 16 gf → 1 cx (24)
    expect(beer).toMatchObject({
      onHand: 44,
      forecast: 60,
      need: 16,
      qty: 1,
      purchaseUnit: 'cx',
      lastPrice: 7200,
    });
    const orders = (
      await api('POST', '/api/replenishment/orders', {
        unitId: T.unit.id,
        lines: [
          {
            productId: ids.beer,
            unitId: ids.cx,
            qty: beer.qty,
            supplierId: ids.supplier,
            unitPrice: beer.lastPrice,
          },
        ],
      })
    ).json().data;
    expect(orders).toHaveLength(1);
    // depois de enviada, a encomenda conta como pendente
    await api('POST', `/api/purchase-orders/${orders[0].id}/status`, { status: 'SENT' });
    const again = (
      await api('GET', `/api/replenishment?unitId=${T.unit.id}&coverageDays=30&lookbackDays=14`)
    ).json().data;
    expect(again.find((x: { code: string }) => x.code === 'CERV')).toBeUndefined();
  });

  it('dashboard', async () => {
    const d = (await api('GET', '/api/dashboard')).json().data;
    expect(d.stockValue).toBeGreaterThan(0);
    expect(d.topConsumption[0].name).toBe('CERV');
    // série de 30 dias com o consumo dos últimos 30 dias
    expect(d.daily).toHaveLength(30);
    const sum = d.daily.reduce((s: number, x: { consumption: number }) => s + x.consumption, 0);
    expect(sum).toBeGreaterThan(0);
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
