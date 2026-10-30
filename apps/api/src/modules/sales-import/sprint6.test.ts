import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants, multipart } from '../../test-utils';
import { explode, loadRecipeBook } from '../recipes/book';

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;
let token = '';
const ids = Object.fromEntries(
  [
    'kg',
    'g',
    'gf',
    'ml',
    'drinks',
    'beer',
    'food',
    'bar',
    'kitchen',
    'meat',
    'oil',
    'beerP',
    'sauce',
    'steak',
    'beerItem',
  ].map((k) => [k, '']),
) as Record<
  | 'kg'
  | 'g'
  | 'gf'
  | 'ml'
  | 'drinks'
  | 'beer'
  | 'food'
  | 'bar'
  | 'kitchen'
  | 'meat'
  | 'oil'
  | 'beerP'
  | 'sauce'
  | 'steak'
  | 'beerItem',
  string
>;

beforeAll(async () => {
  T = await createTestTenant({ name: 'S6', perms: [...PERMISSIONS], plan: 'STOCK' });
  db = tenantDb(T.tenant.id);
  const mu = async (symbol: string) =>
    (await db.measureUnit.create({ data: { name: symbol, symbol } })).id;
  [ids.kg, ids.g, ids.gf, ids.ml] = [await mu('kg'), await mu('g'), await mu('gf'), await mu('ml')];
  ids.drinks = (await db.category.create({ data: { name: 'Bebidas' } })).id;
  ids.beer = (await db.category.create({ data: { name: 'Cervejas', parentId: ids.drinks } })).id;
  ids.food = (await db.category.create({ data: { name: 'Alimentos' } })).id;
  ids.bar = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Bar' } })).id;
  ids.kitchen = (
    await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Cozinha' } })
  ).id;

  // Carne em kg, consumida em g; cerveja em garrafa
  ids.meat = (
    await db.product.create({
      data: {
        code: 'CARNE',
        name: 'Carne',
        categoryId: ids.food,
        stockUnitId: ids.kg,
        consumptionUnitId: ids.g,
      },
    })
  ).id;
  await db.productUnitConversion.create({
    data: { productId: ids.meat, unitId: ids.g, factor: 0.001 },
  });
  ids.oil = (
    await db.product.create({
      data: { code: 'OLEO', name: 'Óleo', categoryId: ids.food, stockUnitId: ids.kg },
    })
  ).id;
  ids.beerP = (
    await db.product.create({
      data: { code: 'CERV', name: 'Cerveja 33cl', categoryId: ids.beer, stockUnitId: ids.gf },
    })
  ).id;

  api = await clientFor(app, T.email);
  token = (
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: T.email, password: 'password123' },
    })
  ).json().data.accessToken;

  // Stock inicial com custo
  await api('POST', '/api/stock/movements', {
    locationId: ids.kitchen,
    items: [
      { productId: ids.meat, type: 'PURCHASE_IN', qty: 10, unitCost: 4000 },
      { productId: ids.oil, type: 'PURCHASE_IN', qty: 5, unitCost: 2000 },
    ],
  });
  await api('POST', '/api/stock/movements', {
    locationId: ids.bar,
    items: [{ productId: ids.beerP, type: 'PURCHASE_IN', qty: 48, unitCost: 300 }],
  });
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('fichas técnicas', () => {
  it('sub-receita com rendimento, perda e conversão de unidades', async () => {
    // Molho: rende 2 kg, leva 1 kg de óleo
    const sauce = (
      await api('POST', '/api/sale-items', {
        code: 'MOLHO',
        name: 'Molho base',
        isSubRecipe: true,
        yieldQty: 2,
        yieldUnit: 'kg',
        lines: [{ productId: ids.oil, qty: 1, unitId: ids.kg }],
      })
    ).json().data;
    ids.sauce = sauce.id;
    // Bife: 200 g de carne com 20% de perda + 0,5 kg de molho
    const res = await api('POST', '/api/sale-items', {
      code: 'BIFE',
      name: 'Bife',
      salePrice: 5000,
      lines: [
        { productId: ids.meat, qty: 200, lossPct: 20 },
        { subRecipeId: sauce.id, qty: 0.5 },
      ],
    });
    expect(res.statusCode).toBe(201);
    ids.steak = res.json().data.id;
    const q = explode(await loadRecipeBook(db), ids.steak, 1);
    expect(q.get(ids.meat)!.toNumber()).toBe(0.25); // 200 g / 0,8 = 250 g = 0,25 kg
    expect(q.get(ids.oil)!.toNumber()).toBe(0.25); // 0,5 / 2 × 1 kg
  });

  it('custo teórico e margem', async () => {
    const list = (await api('GET', '/api/sale-items')).json().data;
    const steak = list.find((i: { id: string }) => i.id === ids.steak);
    expect(steak).toMatchObject({ cost: 1500, margin: 3500, marginPct: 70 }); // 0,25×4000 + 0,25×2000
  });

  it('impede fichas circulares', async () => {
    const res = await api('PUT', `/api/sale-items/${ids.sauce}`, {
      code: 'MOLHO',
      name: 'Molho base',
      isSubRecipe: true,
      yieldQty: 2,
      lines: [{ subRecipeId: ids.steak, qty: 1 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('circular');
  });

  it('artigo de revenda directa (1 ingrediente)', async () => {
    ids.beerItem = (
      await api('POST', '/api/sale-items', {
        code: 'CERV',
        name: 'Cerveja',
        salePrice: 800,
        lines: [{ productId: ids.beerP, qty: 1 }],
      })
    ).json().data.id;
  });
});

describe('importação de vendas', () => {
  let profileId = '';

  async function xlsx(rows: (string | number)[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Vendas');
    ws.addRow(['Data', 'Código', 'Artigo', 'Quantidade', 'Valor']);
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const upload = (file: Buffer, name = 'vendas.xlsx') => {
    const body = multipart(name, file, 'application/octet-stream', {
      unitId: T.unit.id,
      profileId,
    });
    return app.inject({
      method: 'POST',
      url: '/api/sales-imports',
      payload: body.payload,
      headers: { ...body.headers, authorization: `Bearer ${token}` },
    });
  };
  const stock = async (productId: string, locationId: string) =>
    (
      await db.stockBalance.findUnique({
        where: { productId_locationId: { productId, locationId } },
      })
    )?.qty.toNumber();

  it('cria perfil configurável', async () => {
    const res = await api('POST', '/api/import-profiles', {
      name: 'Winrest vendas (teste)',
      posName: 'Winrest',
      columns: {
        itemCode: 'Código',
        itemName: 'Artigo',
        qty: 'Quantidade',
        amount: 'Valor',
        date: 'Data',
      },
    });
    expect(res.statusCode).toBe(201);
    profileId = res.json().data.id;
  });

  let importId = '';
  let file: Buffer;

  it('upload → leitura (job) → pré-visualização agrupada por artigo POS', async () => {
    file = await xlsx([
      ['28/10/2026', 'P01', 'Bife', 2, '10.000'],
      ['29/10/2026', 'P01', 'Bife', 1, '5.000'],
      ['29/10/2026', 'B01', 'Cerveja', 10, '8.000'],
      ['29/10/2026', 'B01', 'Cerveja', -1, '-800'], // devolução
      ['29/10/2026', 'S01', 'Taxa serviço', 1, '500'],
      ['29/10/2026', 'X99', 'Novo prato', 3, '9.000'],
    ]);
    const res = await upload(file);
    expect(res.statusCode).toBe(201);
    const imp = res.json().data;
    importId = imp.id;
    expect(imp).toMatchObject({ status: 'READY', rowCount: 6, totalAmount: 31700, unmapped: 4 });
    expect(imp.periodFrom.slice(0, 10)).toBe('2026-10-28');
    expect(imp.items[0]).toMatchObject({ posCode: 'P01', qty: '3', amount: 15000 });
  });

  it('o mesmo ficheiro não é importado duas vezes', async () => {
    const res = await upload(file);
    expect(res.statusCode).toBe(409);
  });

  it('não confirma sem local de saída definido para as categorias', async () => {
    for (const [code, saleItemId] of [
      ['P01', ids.steak],
      ['B01', ids.beerItem],
    ]) {
      await api('PUT', '/api/pos-mappings', { posName: 'Winrest', posCode: code, saleItemId });
    }
    await api('PUT', '/api/pos-mappings', {
      posName: 'Winrest',
      posCode: 'S01',
      saleItemId: null,
      ignore: true,
    });
    const preview = (await api('GET', `/api/sales-imports/${importId}`)).json().data;
    expect(preview.missingLocations).toEqual(['Alimentos', 'Cervejas']);
    const res = await api('POST', `/api/sales-imports/${importId}/confirm`);
    expect(res.statusCode).toBe(400);
  });

  it('confirma: saídas por ficha técnica, local por categoria (herdado), pendentes ficam por lançar', async () => {
    await api('PUT', '/api/category-output-locations', [
      { categoryId: ids.drinks, unitId: T.unit.id, locationId: ids.bar }, // Cervejas herda de Bebidas
      { categoryId: ids.food, unitId: T.unit.id, locationId: ids.kitchen },
    ]);
    const res = await api('POST', `/api/sales-imports/${importId}/confirm`);
    expect(res.statusCode).toBe(200);
    const imp = res.json().data;
    expect(imp.status).toBe('CONFIRMED');
    expect(imp.pendingLines).toBe(1); // X99

    expect(await stock(ids.meat, ids.kitchen)).toBe(9.25); // 10 − 3 × 0,25
    expect(await stock(ids.oil, ids.kitchen)).toBe(4.25);
    expect(await stock(ids.beerP, ids.bar)).toBe(39); // 48 − (10 − 1)
    const days = await db.stockMovement.findMany({
      where: { refId: importId, productId: ids.meat },
      orderBy: { occurredAt: 'asc' },
    });
    expect(days.map((m) => [m.occurredAt.toISOString().slice(0, 10), m.qty.toNumber()])).toEqual([
      ['2026-10-28', -0.5],
      ['2026-10-29', -0.25],
    ]);
  });

  it('depois de mapear, lança as linhas pendentes', async () => {
    const dish = (
      await api('POST', '/api/sale-items', {
        code: 'NOVO',
        name: 'Novo prato',
        lines: [{ productId: ids.meat, qty: 100 }],
      })
    ).json().data;
    await api('PUT', '/api/pos-mappings', {
      posName: 'Winrest',
      posCode: 'X99',
      saleItemId: dish.id,
    });
    const imp = (await api('POST', `/api/sales-imports/${importId}/post-pending`)).json().data;
    expect(imp.pendingLines).toBe(0);
    expect(await stock(ids.meat, ids.kitchen)).toBe(8.95); // − 3 × 0,1
  });

  it('período sobreposto falha; anular devolve o stock e permite reimportar', async () => {
    const other = await upload(
      await xlsx([['29/10/2026', 'B01', 'Cerveja', 1, '800']]),
      'outro.xlsx',
    );
    expect(other.json().data.status).toBe('FAILED');
    expect(other.json().data.errors[0].message).toContain('sobreposto');

    const cancelled = (await api('POST', `/api/sales-imports/${importId}/cancel`)).json().data;
    expect(cancelled.status).toBe('CANCELLED');
    expect(await stock(ids.meat, ids.kitchen)).toBe(10);
    expect(await stock(ids.beerP, ids.bar)).toBe(48);

    expect((await upload(file)).json().data.status).toBe('READY');
  });
});
