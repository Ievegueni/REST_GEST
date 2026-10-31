/**
 * Painel do dono: tudo o que importa num período, por unidade e consolidado, sem ir aos relatórios.
 * Vendas, custo das vendas, margem, quebras, compras e valor em stock; resultado operacional
 * quando o plano tem resultados financeiros e o utilizador os pode ver.
 */
import { Prisma } from '@prisma/client';
import type { AuthContext } from '../../core/auth';
import { env } from '../../core/env';
import { dailyCells, previousPeriod, sumCells, type Cell } from '../financial/service';
import { addDays, period, todayLocal, zonedMidnight, type Filters } from './common';

type Totals = Cell & { purchases: number };

const pct = (v: number, base: number) => (base ? Math.round((v / base) * 1000) / 10 : null);

async function purchasesByUnitDay(auth: AuthContext, from: string, to: string, units?: string[]) {
  const rows = await auth.db.$queryRaw<{ unitId: string; d: string; amount: number }[]>`
    SELECT l."unitId", to_char(r."receivedAt" AT TIME ZONE ${env.TZ_DISPLAY}, 'YYYY-MM-DD') AS d,
      COALESCE(SUM(r."totalAmount"), 0)::float AS amount
    FROM "GoodsReceipt" r JOIN "StockLocation" l ON l."id" = r."locationId"
    WHERE r."tenantId" = ${auth.tenantId} AND r."status"::text = 'POSTED'
      AND r."receivedAt" >= ${zonedMidnight(from)} AND r."receivedAt" < ${zonedMidnight(addDays(to, 1))}
      ${units ? Prisma.sql`AND l."unitId" IN (${Prisma.join(units)})` : Prisma.empty}
    GROUP BY 1, 2`;
  return rows;
}

async function totals(auth: AuthContext, from: string, to: string, units?: string[]) {
  const [cells, purchases] = await Promise.all([
    dailyCells(auth, from, to, units),
    purchasesByUnitDay(auth, from, to, units),
  ]);
  return { cells, purchases };
}

export async function ownerDashboard(auth: AuthContext, f: Filters, units?: string[]) {
  const p = period(f);
  const prev = previousPeriod(p.from, p.to);
  const db = auth.db;
  const finance = auth.features.has('financial_results') && auth.permissions.has('financial.view');

  const unitList = await db.unit.findMany({
    where: { active: true, ...(units && { id: { in: units } }) },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const ids = unitList.map((u) => u.id);

  const [cur, before, stock, alerts, openAlerts, topItems, topConsumption] = await Promise.all([
    totals(auth, p.from, p.to, ids),
    totals(auth, prev.from, prev.to, ids),
    db.stockCost.findMany({ where: { unitId: { in: ids }, qty: { gt: 0 } } }),
    db.alert.findMany({
      where: { status: 'OPEN', OR: [{ unitId: null }, { unitId: { in: ids } }] },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    db.alert.count({
      where: { status: 'OPEN', OR: [{ unitId: null }, { unitId: { in: ids } }] },
    }),
    // artigos mais vendidos (receita) no período
    db.$queryRaw<{ name: string; qty: number; amount: number }[]>`
      SELECT COALESCE(s."name", l."posLabel", l."posCode") AS name,
        SUM(l."qty")::float AS qty, SUM(l."amount")::float AS amount
      FROM "SalesImportLine" l JOIN "SalesImport" i ON i."id" = l."importId"
        LEFT JOIN "SaleItem" s ON s."id" = l."saleItemId"
      WHERE i."tenantId" = ${auth.tenantId} AND i."status"::text = 'CONFIRMED'
        AND i."unitId" IN (${Prisma.join(ids.length ? ids : [''])})
        AND l."saleDate" >= ${p.from}::date AND l."saleDate" <= ${p.to}::date
      GROUP BY 1 ORDER BY 3 DESC LIMIT 8`,
    // produtos com mais consumo (custo) no período
    db.$queryRaw<{ name: string; value: number }[]>`
      SELECT pr."name", -SUM(m."totalCost")::float AS value
      FROM "StockMovement" m JOIN "StockLocation" l ON l."id" = m."locationId"
        JOIN "Product" pr ON pr."id" = m."productId"
      WHERE m."tenantId" = ${auth.tenantId} AND m."type"::text IN ('SALE_OUT', 'CONSUMPTION')
        AND l."unitId" IN (${Prisma.join(ids.length ? ids : [''])})
        AND m."occurredAt" >= ${p.gte} AND m."occurredAt" < ${p.lt}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
  ]);

  // por unidade
  const byUnit = (t: Awaited<ReturnType<typeof totals>>, unitId: string): Totals => ({
    ...sumCells([...t.cells].filter(([k]) => k.startsWith(`${unitId}|`)).map(([, c]) => c)),
    purchases: Math.round(
      t.purchases.filter((r) => r.unitId === unitId).reduce((a, r) => a + r.amount, 0),
    ),
  });
  const all = (t: Awaited<ReturnType<typeof totals>>): Totals => ({
    ...sumCells(t.cells.values()),
    purchases: Math.round(t.purchases.reduce((a, r) => a + r.amount, 0)),
  });
  const stockOf = (unitId?: string) =>
    Math.round(
      stock
        .filter((c) => !unitId || c.unitId === unitId)
        .reduce((a, c) => a + c.qty.mul(c.avgCost).toNumber(), 0),
    );
  const view = (t: Totals) => ({
    revenue: t.revenue,
    cogs: t.cogs,
    grossMargin: t.revenue - t.cogs,
    grossMarginPct: pct(t.revenue - t.cogs, t.revenue),
    cmvPct: pct(t.cogs + t.waste, t.revenue),
    waste: t.waste,
    purchases: t.purchases,
    ...(finance && {
      opex: t.opex,
      personnel: Math.round(t.personnel),
      result: t.revenue - t.cogs - t.waste - t.opex - Math.round(t.personnel),
    }),
  });

  // série diária de vendas por unidade (todos os dias do período)
  const days = Array.from({ length: Math.min(p.days, 400) }, (_, i) => addDays(p.from, i));

  // vendas desta semana (segunda até hoje), independentemente do filtro
  const today = todayLocal();
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const week = await dailyCells(auth, weekStart, today, ids);

  return {
    period: { from: p.from, to: p.to },
    previous: prev,
    finance,
    total: { ...view(all(cur)), stockValue: stockOf() },
    previousTotal: view(all(before)),
    units: unitList.map((u) => ({
      unitId: u.id,
      name: u.name,
      ...view(byUnit(cur, u.id)),
      stockValue: stockOf(u.id),
    })),
    daily: {
      days,
      units: unitList.map((u) => ({
        unitId: u.id,
        name: u.name,
        revenue: days.map((d) => cur.cells.get(`${u.id}|${d}`)?.revenue ?? 0),
      })),
    },
    weekSales: {
      from: weekStart,
      to: today,
      units: unitList.map((u) => ({
        unitId: u.id,
        name: u.name,
        amount: [...week]
          .filter(([k]) => k.startsWith(`${u.id}|`))
          .reduce((a, [, c]) => a + c.revenue, 0),
      })),
    },
    openAlerts,
    alerts,
    topItems: topItems.map((r) => ({ ...r, amount: Math.round(r.amount) })),
    topConsumption: topConsumption.map((r) => ({ ...r, value: Math.round(r.value) })),
  };
}
