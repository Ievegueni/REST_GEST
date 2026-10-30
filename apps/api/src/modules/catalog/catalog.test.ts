import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';

const app = await buildApp();
let A: Awaited<ReturnType<typeof createTestTenant>>;
let B: Awaited<ReturnType<typeof createTestTenant>>;
let api: Awaited<ReturnType<typeof clientFor>>;
let catB = '';
const unit: Record<string, string> = {};

beforeAll(async () => {
  A = await createTestTenant({ name: 'CatA', perms: [...PERMISSIONS] });
  B = await createTestTenant({ name: 'CatB', perms: ['catalog.view'] });
  for (const symbol of ['gf', 'cx', 'ml']) {
    unit[symbol] = (
      await tenantDb(A.tenant.id).measureUnit.create({ data: { name: symbol, symbol } })
    ).id;
  }
  catB = (await tenantDb(B.tenant.id).category.create({ data: { name: 'Bebidas' } })).id;
  api = await clientFor(app, A.email);
});

afterAll(async () => {
  await deleteTenants([A.tenant.id, B.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('categorias', () => {
  it('cria hierarquia e impede ciclos', async () => {
    const pai = (await api('POST', '/api/categories', { name: 'Bebidas' })).json().data;
    const filho = (
      await api('POST', '/api/categories', { name: 'Cervejas', parentId: pai.id })
    ).json().data;
    const res = await api('PATCH', `/api/categories/${pai.id}`, { parentId: filho.id });
    expect(res.statusCode).toBe(400);
  });

  it('não aceita pai de outro tenant (FK composta)', async () => {
    const res = await api('POST', '/api/categories', { name: 'X', parentId: catB });
    expect(res.statusCode).toBe(400);
  });
});

describe('produtos', () => {
  let categoryId = '';
  beforeAll(async () => {
    categoryId = (await api('POST', '/api/categories', { name: 'Águas' })).json().data.id;
  });

  const product = (over: object = {}) => ({
    code: 'AG01',
    name: 'Água 0,5L',
    categoryId,
    stockUnitId: unit.gf,
    purchaseUnitId: unit.cx,
    conversions: [{ unitId: unit.cx, factor: 24 }],
    limits: [{ locationId: '', minQty: 12, maxQty: 48 }],
    ...over,
  });

  it('cria produto com conversões e limites por local', async () => {
    const loc = await tenantDb(A.tenant.id).stockLocation.create({
      data: { unitId: A.unit.id, name: 'Bar' },
    });
    const res = await api(
      'POST',
      '/api/products',
      product({ limits: [{ locationId: loc.id, minQty: 12, maxQty: 48 }] }),
    );
    expect(res.statusCode).toBe(201);
    const p = res.json().data;
    expect(p.conversions[0]).toMatchObject({ factor: '24', unit: { symbol: 'cx' } });
    expect(p.locationLimits[0]).toMatchObject({ minQty: '12', maxQty: '48' });
  });

  it('código duplicado no tenant → 409', async () => {
    expect((await api('POST', '/api/products', product({ limits: [] }))).statusCode).toBe(409);
  });

  it('unidade de compra sem conversão → 400', async () => {
    const res = await api(
      'POST',
      '/api/products',
      product({ code: 'AG02', conversions: [], limits: [] }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('mínimo maior que máximo → 400', async () => {
    const res = await api(
      'POST',
      '/api/products',
      product({ code: 'AG03', limits: [{ locationId: 'x', minQty: 5, maxQty: 1 }] }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('categoria de outro tenant → 400', async () => {
    const res = await api(
      'POST',
      '/api/products',
      product({ code: 'AG04', categoryId: catB, limits: [] }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('pesquisa por nome ou código', async () => {
    const list = (await api('GET', '/api/products?search=ag01')).json().data;
    expect(list).toHaveLength(1);
  });

  it('sem catalog.manage não escreve', async () => {
    const apiB = await clientFor(app, B.email);
    expect((await apiB('POST', '/api/categories', { name: 'Y' })).statusCode).toBe(403);
    expect((await apiB('GET', '/api/products')).json().data).toEqual([]);
  });
});

describe('fornecedores', () => {
  it('lista de produtos substituída e data do preço só muda quando o preço muda', async () => {
    const s = (
      await api('POST', '/api/suppliers', { name: 'Distribuidora X', paymentTermDays: 30 })
    ).json().data;
    const p = await prisma.product.findFirstOrThrow({ where: { tenantId: A.tenant.id } });
    const put = (lastPrice: number) =>
      api('PUT', `/api/suppliers/${s.id}/products`, [{ productId: p.id, lastPrice }]);

    const first = (await put(12000)).json().data[0];
    expect(first.lastPrice).toBe(12000);
    const same = (await put(12000)).json().data[0];
    expect(same.lastPriceAt).toBe(first.lastPriceAt);
    const changed = (await put(13000)).json().data[0];
    expect(changed.lastPriceAt).not.toBe(first.lastPriceAt);
  });

  it('email inválido → 400', async () => {
    expect(
      (await api('POST', '/api/suppliers', { name: 'Y', email: 'nao-e-email' })).statusCode,
    ).toBe(400);
  });
});

describe('unidades e utilizadores', () => {
  it('respeita o limite de unidades do plano', async () => {
    await prisma.tenant.update({ where: { id: A.tenant.id }, data: { maxUnits: 2 } });
    expect((await api('POST', '/api/units', { name: 'Segunda' })).statusCode).toBe(201);
    const res = await api('POST', '/api/units', { name: 'Terceira' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain('Limite');
  });

  it('utilizador com acesso restrito só vê as suas unidades', async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { tenantId: A.tenant.id } });
    const res = await api('POST', '/api/users', {
      name: 'Ecónomo',
      email: `eco-${A.tenant.id}@test.local`,
      password: 'password123',
      roleId: role.id,
      unitIds: [A.unit.id],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.unitIds).toEqual([A.unit.id]);

    const eco = await clientFor(app, `eco-${A.tenant.id}@test.local`);
    const units = (await eco('GET', '/api/units')).json().data;
    expect(units.map((u: { id: string }) => u.id)).toEqual([A.unit.id]);
  });

  it('não associa unidade de outro tenant', async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { tenantId: A.tenant.id } });
    const res = await api('POST', '/api/users', {
      name: 'X',
      email: `x-${A.tenant.id}@test.local`,
      password: 'password123',
      roleId: role.id,
      unitIds: [B.unit.id],
    });
    expect(res.statusCode).toBe(400);
  });

  it('não se desactiva a si próprio', async () => {
    expect((await api('PATCH', `/api/users/${A.user.id}`, { active: false })).statusCode).toBe(400);
  });
});

describe('importação Excel', () => {
  async function xlsx(rows: (string | number)[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('P');
    ws.addRow(['Nome', 'Código', 'Categoria', 'Unidade', 'Controla lote']); // ordem diferente do modelo
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async function upload(file: Buffer, dryRun: boolean) {
    const boundary = '----t';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="p.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const token = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: A.email, password: 'password123' },
      })
    ).json().data.accessToken;
    return app.inject({
      method: 'POST',
      url: `/api/products/import?dryRun=${dryRun}`,
      payload: body,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
    });
  }

  it('modelo descarregável tem as colunas esperadas', async () => {
    const res = await api('GET', '/api/products/import/template');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets[0]!.getRow(1).getCell(1).value).toBe('Código');
  });

  it('pré-visualização reporta erros por linha e não grava', async () => {
    const file = await xlsx([
      ['Cerveja 33cl', 'CV01', 'Bebidas > Cervejas', 'gf', 'não'],
      ['Sem unidade', 'CV02', 'Bebidas', 'zz', ''],
      ['Repetido', 'CV01', 'Bebidas', 'gf', ''],
    ]);
    const r = (await upload(file, false)).json().data;
    expect(r.applied).toBe(false);
    expect(r.errors.map((e: { row: number }) => e.row)).toEqual([3, 4]);
    expect(await prisma.product.count({ where: { tenantId: A.tenant.id, code: 'CV01' } })).toBe(0);
  });

  it('aplica: cria categorias em falta e actualiza códigos existentes', async () => {
    const file = await xlsx([
      ['Cerveja 33cl', 'CV01', 'Bebidas > Cervejas', 'gf', 'sim'],
      ['Água renomeada', 'AG01', 'Águas', 'GF', ''],
    ]);
    const dry = (await upload(file, true)).json().data;
    expect(dry).toMatchObject({ create: 1, update: 1, applied: false });
    const r = (await upload(file, false)).json().data;
    expect(r.applied).toBe(true);

    const cv = await prisma.product.findFirstOrThrow({
      where: { tenantId: A.tenant.id, code: 'CV01' },
      include: { category: { include: { parent: true } } },
    });
    expect(cv.tracksLots).toBe(true);
    expect(cv.category.name).toBe('Cervejas');
    expect(cv.category.parent?.name).toBe('Bebidas'); // reutilizou a categoria existente
    expect(await prisma.category.count({ where: { tenantId: A.tenant.id, name: 'Bebidas' } })).toBe(
      1,
    );
    const ag = await prisma.product.findFirstOrThrow({
      where: { tenantId: A.tenant.id, code: 'AG01' },
    });
    expect(ag.name).toBe('Água renomeada');
  });
});
