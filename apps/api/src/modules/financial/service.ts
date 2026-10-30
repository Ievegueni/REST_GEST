/**
 * Resultados financeiros: receita (vendas POS) − CMV (saídas por venda + quebras, ao custo)
 * − custos operacionais (custos diários) − custo de pessoal (salários aprovados, rateado por dia).
 */
import type { AuthContext } from '../../core/auth';
import { env } from '../../core/env';
import { zonedMidnight } from '../reports/common';

export type Metrics = {
  revenue: number;
  cogs: number;
  waste: number;
  opex: number;
  personnel: number;
  result: number;
  cmvPct: number | null;
  personnelPct: number | null;
  breakEven: number | null;
};

export function metrics(
  m: Pick<Metrics, 'revenue' | 'cogs' | 'waste' | 'opex' | 'personnel'>,
): Metrics {
  const cmv = m.cogs + m.waste;
  const pct = (v: number) => (m.revenue ? Math.round((v / m.revenue) * 1000) / 10 : null);
  const margin = m.revenue ? 1 - cmv / m.revenue : 0;
  return {
    ...m,
    result: m.revenue - cmv - m.opex - m.personnel,
    cmvPct: pct(cmv),
    personnelPct: pct(m.personnel),
    // receita necessária para cobrir os custos fixos com a margem de contribuição actual
    breakEven: margin > 0 ? Math.round((m.opex + m.personnel) / margin) : null,
  };
}

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export type Cell = {
  revenue: number;
  cogs: number;
  waste: number;
  opex: number;
  personnel: number;
};
const empty = (): Cell => ({ revenue: 0, cogs: 0, waste: 0, opex: 0, personnel: 0 });

/** Valores por unidade e dia (YYYY-MM-DD) no intervalo [from, to]. */
export async function dailyCells(auth: AuthContext, from: string, to: string, unitIds?: string[]) {
  const db = auth.db;
  const cells = new Map<string, Cell>(); // "unitId|dia"
  const cell = (unitId: string, d: string) => {
    const k = `${unitId}|${d}`;
    let c = cells.get(k);
    if (!c) cells.set(k, (c = empty()));
    return c;
  };
  const inUnits = (u: string) => !unitIds || unitIds.includes(u);

  // Receita: linhas de vendas confirmadas
  const sales = await db.salesImportLine.groupBy({
    by: ['importId', 'saleDate'],
    where: {
      saleDate: { gte: new Date(from), lte: new Date(to) },
      import: { status: 'CONFIRMED', ...(unitIds && { unitId: { in: unitIds } }) },
    },
    _sum: { amount: true },
  });
  const importUnit = new Map(
    (
      await db.salesImport.findMany({
        where: { id: { in: [...new Set(sales.map((s) => s.importId))] } },
        select: { id: true, unitId: true },
      })
    ).map((i) => [i.id, i.unitId]),
  );
  for (const s of sales)
    cell(importUnit.get(s.importId)!, s.saleDate.toISOString().slice(0, 10)).revenue +=
      s._sum.amount ?? 0;

  // CMV e quebras: custo real dos movimentos, por dia no fuso de apresentação
  const mv = await db.$queryRaw<
    { unitId: string; d: Date; cogs: bigint | null; waste: bigint | null }[]
  >`
    SELECT l."unitId", (m."occurredAt" AT TIME ZONE ${env.TZ_DISPLAY})::date AS d,
      -SUM(CASE WHEN m."type"::text = 'SALE_OUT' THEN m."totalCost" ELSE 0 END) AS cogs,
      -SUM(CASE WHEN m."type"::text = 'WASTE' THEN m."totalCost" ELSE 0 END) AS waste
    FROM "StockMovement" m JOIN "StockLocation" l ON l."id" = m."locationId"
    WHERE m."tenantId" = ${auth.tenantId} AND m."type"::text IN ('SALE_OUT', 'WASTE')
      AND m."occurredAt" >= ${zonedMidnight(from)} AND m."occurredAt" < ${zonedMidnight(addDays(to, 1))}
    GROUP BY 1, 2`;
  for (const r of mv) {
    if (!inUnits(r.unitId)) continue;
    const c = cell(r.unitId, r.d.toISOString().slice(0, 10));
    c.cogs += Number(r.cogs ?? 0);
    c.waste += Number(r.waste ?? 0);
  }

  // Custos operacionais
  const costs = await db.dailyCost.groupBy({
    by: ['unitId', 'date'],
    where: {
      date: { gte: new Date(from), lte: new Date(to) },
      ...(unitIds && { unitId: { in: unitIds } }),
    },
    _sum: { amount: true },
  });
  for (const c of costs)
    cell(c.unitId, c.date.toISOString().slice(0, 10)).opex += c._sum.amount ?? 0;

  // Custo de pessoal: salários aprovados/pagos do mês, rateados pelos dias do mês
  const runs = await db.payrollRun.findMany({
    where: { status: { in: ['APPROVED', 'PAID'] }, ...(unitIds && { unitId: { in: unitIds } }) },
    select: { unitId: true, year: true, month: true, totalCost: true },
  });
  for (const r of runs) {
    const days = new Date(Date.UTC(r.year, r.month, 0)).getUTCDate();
    const perDay = r.totalCost / days;
    for (let i = 1; i <= days; i++) {
      const d = `${r.year}-${String(r.month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      if (d >= from && d <= to) cell(r.unitId, d).personnel += perDay;
    }
  }
  return cells;
}

export function sumCells(cells: Iterable<Cell>): Cell {
  const t = empty();
  for (const c of cells) for (const k of Object.keys(t) as (keyof Cell)[]) t[k] += c[k];
  for (const k of Object.keys(t) as (keyof Cell)[]) t[k] = Math.round(t[k]);
  return t;
}

/** Período anterior com a mesma duração. */
export function previousPeriod(from: string, to: string) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/** Resumo para o dashboard executivo: por unidade, consolidado e período anterior. */
export async function summary(
  auth: AuthContext,
  from: string,
  to: string,
  unitIds: string[] | undefined,
) {
  const [cells, prevCells, units] = await Promise.all([
    dailyCells(auth, from, to, unitIds),
    (() => {
      const p = previousPeriod(from, to);
      return dailyCells(auth, p.from, p.to, unitIds);
    })(),
    auth.db.unit.findMany({
      where: { active: true, ...(unitIds && { id: { in: unitIds } }) },
      orderBy: { name: 'asc' },
    }),
  ]);
  const byUnit = units.map((u) => ({
    unitId: u.id,
    name: u.name,
    ...metrics(sumCells([...cells].filter(([k]) => k.startsWith(`${u.id}|`)).map(([, c]) => c))),
  }));
  const days = new Map<string, Cell[]>();
  for (const [k, c] of cells) {
    const d = k.split('|')[1]!;
    days.set(d, [...(days.get(d) ?? []), c]);
  }
  return {
    from,
    to,
    total: metrics(sumCells(cells.values())),
    previous: { ...previousPeriod(from, to), ...metrics(sumCells(prevCells.values())) },
    units: byUnit,
    daily: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, cs]) => ({ date: d, ...metrics(sumCells(cs)) })),
  };
}
