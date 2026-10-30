import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';
import { postMovements, reverseMovements, type MovementInput } from './engine';

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;
const ids = { gf: '', cx: '', cat: '', bar: '', store: '', otherUnit: '', otherLoc: '' };
let seq = 0;

/** Produto novo por teste: saldos e custos isolados. */
async function newProduct(opts: { tracksLots?: boolean } = {}) {
  const p = await db.product.create({
    data: {
      code: `P${++seq}`,
      name: `Produto ${seq}`,
      categoryId: ids.cat,
      stockUnitId: ids.gf,
      tracksLots: opts.tracksLots ?? false,
    },
  });
  await db.productUnitConversion.create({ data: { productId: p.id, unitId: ids.cx, factor: 24 } });
  return p.id;
}

const run = (inputs: MovementInput[], occurredAt?: Date) =>
  db.$transaction((tx) =>
    postMovements(tx, inputs, { tenantId: T.tenant.id, userId: T.user.id, occurredAt }),
  );
const reverse = (id: string) =>
  db.$transaction((tx) => reverseMovements(tx, [id], { tenantId: T.tenant.id, userId: T.user.id }));
const cost = async (productId: string, unitId = T.unit.id) =>
  db.stockCost.findUniqueOrThrow({ where: { productId_unitId: { productId, unitId } } });
const balance = async (productId: string, locationId = ids.bar) =>
  (
    await db.stockBalance.findUnique({ where: { productId_locationId: { productId, locationId } } })
  )?.qty.toNumber() ?? 0;
const policy = (negativeStockPolicy: 'ALLOW' | 'BLOCK') =>
  prisma.tenant.update({ where: { id: T.tenant.id }, data: { negativeStockPolicy } });

beforeAll(async () => {
  T = await createTestTenant({ name: 'StockT', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  ids.gf = (await db.measureUnit.create({ data: { name: 'Garrafa', symbol: 'gf' } })).id;
  ids.cx = (await db.measureUnit.create({ data: { name: 'Caixa', symbol: 'cx' } })).id;
  ids.cat = (await db.category.create({ data: { name: 'Bebidas' } })).id;
  ids.bar = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Bar' } })).id;
  ids.store = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Armazém' } })).id;
  ids.otherUnit = (await db.unit.create({ data: { name: 'Outra unidade' } })).id;
  ids.otherLoc = (
    await db.stockLocation.create({ data: { unitId: ids.otherUnit, name: 'Bar 2' } })
  ).id;
  api = await clientFor(app, T.email);
});

beforeEach(() => policy('ALLOW'));

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

const IN = (
  productId: string,
  qty: number,
  unitCost: number,
  locationId = ids.bar,
): MovementInput => ({
  productId,
  locationId,
  type: 'PURCHASE_IN',
  qty,
  unitCost,
});
const OUT = (productId: string, qty: number, locationId = ids.bar): MovementInput => ({
  productId,
  locationId,
  type: 'CONSUMPTION',
  qty,
});

describe('custo médio ponderado', () => {
  it('recalcula nas entradas e as saídas saem ao custo médio', async () => {
    const p = await newProduct();
    await run([IN(p, 10, 100), IN(p, 30, 200)]);
    expect((await cost(p)).avgCost.toNumber()).toBe(175);

    const [out] = await run([OUT(p, 20)]);
    expect(out!.unitCost.toNumber()).toBe(175);
    expect(out!.totalCost).toBe(-3500);
    expect(out!.balanceAfter.toNumber()).toBe(20);
    const c = await cost(p);
    expect([c.qty.toNumber(), c.avgCost.toNumber()]).toEqual([20, 175]);
  });

  it('converte unidade de compra para unidade de stock (qtd e custo)', async () => {
    const p = await newProduct();
    const [m] = await run([{ ...IN(p, 2, 4800), unitId: ids.cx }]);
    expect(m!.qty.toNumber()).toBe(48);
    expect(m!.unitCost.toNumber()).toBe(200);
    expect(m!.totalCost).toBe(9600);
  });

  it('é por unidade (estabelecimento): locais da mesma unidade partilham, outra unidade não', async () => {
    const p = await newProduct();
    await run([IN(p, 10, 100, ids.bar), IN(p, 10, 300, ids.store), IN(p, 10, 1000, ids.otherLoc)]);
    expect((await cost(p)).avgCost.toNumber()).toBe(200);
    expect((await cost(p, ids.otherUnit)).avgCost.toNumber()).toBe(1000);
  });

  it('com stock negativo, a entrada seguinte define o custo', async () => {
    const p = await newProduct();
    await run([OUT(p, 5)]);
    await run([IN(p, 10, 150)]);
    const c = await cost(p);
    expect([c.qty.toNumber(), c.avgCost.toNumber()]).toEqual([5, 150]);
  });

  it('arredonda o custo total a AOA inteiros', async () => {
    const p = await newProduct();
    const [m] = await run([{ ...IN(p, 3, 1000), unitId: ids.cx }]); // 72 gf a 41,6667
    expect(m!.totalCost).toBe(3000);
    expect(m!.unitCost.toNumber()).toBeCloseTo(41.6667, 4);
  });
});

describe('estornos', () => {
  it('estornar uma entrada retira-a ao custo original e repõe a média anterior', async () => {
    const p = await newProduct();
    await run([IN(p, 10, 100)]);
    const [second] = await run([IN(p, 10, 300)]);
    expect((await cost(p)).avgCost.toNumber()).toBe(200);
    await reverse(second!.id);
    const c = await cost(p);
    expect([c.qty.toNumber(), c.avgCost.toNumber()]).toEqual([10, 100]);
  });

  it('estornar uma saída repõe quantidade ao custo da saída', async () => {
    const p = await newProduct();
    await run([IN(p, 10, 100)]);
    const [out] = await run([OUT(p, 4)]);
    const [rev] = await reverse(out!.id);
    expect(rev!.qty.toNumber()).toBe(4);
    expect(rev!.reversalOfId).toBe(out!.id);
    expect(await balance(p)).toBe(10);
  });

  it('não estorna duas vezes nem estorna um estorno', async () => {
    const p = await newProduct();
    const [m] = await run([IN(p, 1, 100)]);
    const [rev] = await reverse(m!.id);
    await expect(reverse(m!.id)).rejects.toThrow('já estornado');
    await expect(reverse(rev!.id)).rejects.toThrow('estorno não pode');
  });
});

describe('stock negativo', () => {
  it('BLOCK impede a saída e não grava nada (rollback)', async () => {
    const p = await newProduct();
    await run([IN(p, 5, 100)]);
    await policy('BLOCK');
    await expect(run([OUT(p, 2), OUT(p, 4)])).rejects.toThrow('Stock insuficiente');
    expect(await balance(p)).toBe(5);
    expect(await db.stockMovement.count({ where: { productId: p } })).toBe(1);
  });

  it('ALLOW deixa ficar negativo', async () => {
    const p = await newProduct();
    await run([OUT(p, 3)]);
    expect(await balance(p)).toBe(-3);
  });
});

describe('lotes e FEFO', () => {
  it('exige lote na entrada de produto com lote', async () => {
    const p = await newProduct({ tracksLots: true });
    await expect(run([IN(p, 1, 100)])).rejects.toThrow('Lote obrigatório');
  });

  it('saída sem lote consome primeiro a validade mais próxima', async () => {
    const p = await newProduct({ tracksLots: true });
    await run([
      { ...IN(p, 5, 100), lot: { code: 'A', expiryDate: new Date('2027-12-01') } },
      { ...IN(p, 5, 100), lot: { code: 'B', expiryDate: new Date('2027-11-15') } },
      { ...IN(p, 5, 100), lot: { code: 'C' } },
    ]);
    const out = await run([OUT(p, 7)]);
    const lots = await db.lot.findMany({ where: { productId: p } });
    const code = (id: string | null) => lots.find((l) => l.id === id)?.code;
    expect(out.map((m) => [code(m.lotId), m.qty.toNumber()])).toEqual([
      ['B', -5],
      ['A', -2],
    ]);
  });

  it('com BLOCK não deixa sair mais do que os lotes têm', async () => {
    const p = await newProduct({ tracksLots: true });
    await run([{ ...IN(p, 2, 100), lot: { code: 'X' } }]);
    await policy('BLOCK');
    await expect(run([OUT(p, 3)])).rejects.toThrow('Stock insuficiente');
  });
});

describe('concorrência', () => {
  it('20 saídas simultâneas com stock 10 e BLOCK: exactamente 10 passam', async () => {
    const p = await newProduct();
    await run([IN(p, 10, 100)]);
    await policy('BLOCK');
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => run([OUT(p, 1)])));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(await balance(p)).toBe(0);
    expect((await cost(p)).qty.toNumber()).toBe(0);
  });

  it('entradas simultâneas mantêm quantidade e custo médio coerentes', async () => {
    const p = await newProduct();
    await Promise.all(Array.from({ length: 10 }, (_, i) => run([IN(p, 1, (i + 1) * 100)])));
    const c = await cost(p);
    expect(c.qty.toNumber()).toBe(10);
    // o custo médio é guardado a 4 casas: a ordem de chegada pode mexer na 4.ª casa
    expect(c.avgCost.toNumber()).toBeCloseTo(550, 3);
    const balances = (
      await db.stockMovement.findMany({ where: { productId: p }, orderBy: { createdAt: 'asc' } })
    ).map((m) => m.balanceAfter.toNumber());
    expect(balances.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('API', () => {
  it('quebra sem motivo → 400', async () => {
    const p = await newProduct();
    const res = await api('POST', '/api/stock/movements', {
      locationId: ids.bar,
      items: [{ productId: p, type: 'WASTE', qty: 1 }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('regista movimento, mostra no kardex e estorna', async () => {
    const p = await newProduct();
    const res = await api('POST', '/api/stock/movements', {
      locationId: ids.bar,
      items: [{ productId: p, type: 'PURCHASE_IN', qty: 1, unitId: ids.cx, unitCost: 2400 }],
    });
    expect(res.statusCode).toBe(201);
    const id = res.json().data[0].id;
    expect((await api('POST', `/api/stock/movements/${id}/reverse`)).statusCode).toBe(201);

    const k = (await api('GET', `/api/stock/products/${p}/kardex?locationId=${ids.bar}`)).json()
      .data;
    expect(
      k.items.map((m: { qty: string; balanceAfter: string }) => [m.qty, m.balanceAfter]),
    ).toEqual([
      ['-24', '0'],
      ['24', '24'],
    ]);
  });

  it('movimentos de documentos não se estornam à mão', async () => {
    const p = await newProduct();
    const [m] = await db.$transaction((tx) =>
      postMovements(tx, [IN(p, 1, 1)], {
        tenantId: T.tenant.id,
        userId: null,
        refType: 'GoodsReceipt',
        refId: 'x',
      }),
    );
    expect((await api('POST', `/api/stock/movements/${m!.id}/reverse`)).statusCode).toBe(400);
  });

  it('saldos com valor e indicador abaixo do mínimo', async () => {
    const p = await newProduct();
    await db.productLocationLimit.create({
      data: { productId: p, locationId: ids.bar, minQty: 10 },
    });
    await run([IN(p, 4, 250)]);
    const rows = (await api('GET', '/api/stock/balances?belowMin=true')).json().data;
    const row = rows.find((r: { product: { id: string } }) => r.product.id === p);
    expect(row).toMatchObject({ qty: '4', value: 1000, belowMin: true });
  });

  it('a unidade de stock não muda depois de haver movimentos', async () => {
    const p = await newProduct();
    await run([IN(p, 1, 1)]);
    const res = await api('PATCH', `/api/products/${p}`, { stockUnitId: ids.cx, conversions: [] });
    expect(res.statusCode).toBe(400);
  });

  it('política de stock negativo nas definições, com auditoria', async () => {
    const res = await api('PATCH', '/api/settings', { negativeStockPolicy: 'BLOCK' });
    expect(res.json().data.negativeStockPolicy).toBe('BLOCK');
    expect(
      await prisma.auditLog.count({ where: { tenantId: T.tenant.id, action: 'settings.update' } }),
    ).toBe(1);
  });
});
