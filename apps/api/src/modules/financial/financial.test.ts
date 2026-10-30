import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';
import { postMovements } from '../stock/engine';
import { metrics } from './service';

describe('indicadores', () => {
  it('resultado, CMV %, pessoal % e ponto de equilíbrio', () => {
    const m = metrics({
      revenue: 1_000_000,
      cogs: 300_000,
      waste: 20_000,
      opex: 200_000,
      personnel: 250_000,
    });
    expect(m).toMatchObject({ result: 230_000, cmvPct: 32, personnelPct: 25 });
    expect(m.breakEven).toBe(661_765); // 450000 / (1 − 0,32)
    expect(metrics({ revenue: 0, cogs: 0, waste: 0, opex: 10, personnel: 0 }).breakEven).toBeNull();
  });
});

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;

beforeAll(async () => {
  T = await createTestTenant({ name: 'Fin', plan: 'COMPLETO', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  api = await clientFor(app, T.email);
  const gf = (await db.measureUnit.create({ data: { name: 'gf', symbol: 'gf' } })).id;
  const cat = (await db.category.create({ data: { name: 'Bebidas' } })).id;
  const p = (
    await db.product.create({ data: { code: 'B', name: 'B', categoryId: cat, stockUnitId: gf } })
  ).id;
  const loc = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Bar' } })).id;
  const at = (d: string) => new Date(`${d}T12:00:00Z`);
  const post = (type: 'PURCHASE_IN' | 'SALE_OUT' | 'WASTE', qty: number, d: string) =>
    db.$transaction((tx) =>
      postMovements(
        tx,
        [
          {
            productId: p,
            locationId: loc,
            type,
            qty,
            unitCost: type === 'PURCHASE_IN' ? 100 : null,
            reason: 'x',
          },
        ],
        { tenantId: T.tenant.id, userId: T.user.id, occurredAt: at(d) },
      ),
    );
  await post('PURCHASE_IN', 100, '2026-08-31');
  await post('SALE_OUT', 30, '2026-09-10'); // CMV 3000
  await post('WASTE', 2, '2026-09-11'); // quebras 200

  // Receita: importação confirmada com vendas no dia 10
  const profile = await db.importProfile.create({
    data: { name: 'P', posName: 'POS', columns: { itemCode: 'A', qty: 'B' } },
  });
  const imp = await db.salesImport.create({
    data: {
      number: 1,
      unitId: T.unit.id,
      profileId: profile.id,
      fileName: 'x.xlsx',
      fileHash: `h-${T.tenant.id}`,
      status: 'CONFIRMED',
      createdById: T.user.id,
    },
  });
  await db.salesImportLine.create({
    data: {
      importId: imp.id,
      rowNumber: 2,
      posCode: 'A',
      qty: 30,
      amount: 15000,
      saleDate: new Date('2026-09-10'),
      postedAt: new Date(),
    },
  });

  // Custos operacionais e salários aprovados de Setembro (30 dias → 300/dia)
  const costCat = (await db.costCategory.create({ data: { name: 'Energia' } })).id;
  await db.dailyCost.create({
    data: {
      unitId: T.unit.id,
      date: new Date('2026-09-15'),
      categoryId: costCat,
      amount: 1000,
      createdById: T.user.id,
    },
  });
  const table = await prisma.taxTable.create({
    data: {
      validFrom: new Date('1999-01-01'),
      inssEmployeeRate: 0,
      inssEmployerRate: 0,
      irtBrackets: [{ upTo: null, fixed: 0, rate: 0, excessOver: 0 }],
    },
  });
  await db.payrollRun.create({
    data: {
      unitId: T.unit.id,
      year: 2026,
      month: 9,
      status: 'APPROVED',
      taxTableId: table.id,
      params: {},
      totalCost: 9000,
      createdById: T.user.id,
    },
  });
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await prisma.taxTable.deleteMany({ where: { validFrom: new Date('1999-01-01') } });
  await app.close();
  await prisma.$disconnect();
});

describe('resultados financeiros', () => {
  it('mês completo: receita − CMV − quebras − custos − pessoal', async () => {
    const s = (await api('GET', '/api/financial/summary?from=2026-09-01&to=2026-09-30')).json()
      .data;
    expect(s.total).toMatchObject({
      revenue: 15000,
      cogs: 3000,
      waste: 200,
      opex: 1000,
      personnel: 9000,
      result: 1800,
    });
    expect(s.units[0]).toMatchObject({ revenue: 15000, result: 1800 });
    expect(s.previous).toMatchObject({ from: '2026-08-02', to: '2026-08-31', revenue: 0 });
  });

  it('vista diária rateia o custo de pessoal', async () => {
    const s = (await api('GET', '/api/financial/summary?from=2026-09-10&to=2026-09-10')).json()
      .data;
    expect(s.total).toMatchObject({ revenue: 15000, cogs: 3000, personnel: 300 });
  });

  it('relatório mensal exportável', async () => {
    const res = await api(
      'GET',
      '/api/reports/financial-results?from=2026-09-01&to=2026-09-30&group=month',
    );
    const r = res.json().data;
    expect(r.rows).toEqual([expect.objectContaining({ period: '09/2026', result: 1800 })]);
  });
});
