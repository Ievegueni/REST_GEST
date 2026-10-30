/**
 * Sugestão de reposição por unidade:
 * consumo médio por dia da semana (últimos N dias) × próximos dias de cobertura
 * − stock actual − encomendas pendentes, arredondado à unidade de compra.
 */
import { Prisma } from '@prisma/client';
import { assertUnitAccess, type AuthContext } from '../../core/auth';
import { env } from '../../core/env';
import { AppError } from '../../core/errors';
import { saveOrder } from '../purchases/service';
import { todayLocal, zonedMidnight } from './common';

const D = Prisma.Decimal;

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** 1 = segunda … 7 = domingo (ISO), para uma data YYYY-MM-DD. */
const isoDow = (d: string) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Previsão para os próximos dias, a partir do consumo por dia da semana no histórico. */
export function forecast(byDow: Map<number, number>, historyDays: string[], nextDays: string[]) {
  const occurrences = new Map<number, number>();
  for (const d of historyDays) occurrences.set(isoDow(d), (occurrences.get(isoDow(d)) ?? 0) + 1);
  return nextDays.reduce((s, d) => {
    const dow = isoDow(d);
    const n = occurrences.get(dow) ?? 0;
    return s + (n ? (byDow.get(dow) ?? 0) / n : 0);
  }, 0);
}

export async function suggest(
  auth: AuthContext,
  q: { unitId: string; coverageDays: number; lookbackDays: number },
) {
  assertUnitAccess(auth, q.unitId);
  const db = auth.db;
  const today = todayLocal();
  const historyDays = Array.from({ length: q.lookbackDays }, (_, i) =>
    addDays(today, -q.lookbackDays + i),
  );
  const nextDays = Array.from({ length: q.coverageDays }, (_, i) => addDays(today, i + 1));

  const rows = await db.$queryRaw<{ productId: string; dow: number; qty: Prisma.Decimal }[]>`
    SELECT m."productId", EXTRACT(ISODOW FROM (m."occurredAt" AT TIME ZONE ${env.TZ_DISPLAY}))::int AS dow, -SUM(m."qty") AS qty
    FROM "StockMovement" m JOIN "StockLocation" l ON l."id" = m."locationId"
    WHERE m."tenantId" = ${auth.tenantId} AND l."unitId" = ${q.unitId}
      AND m."type"::text IN ('SALE_OUT', 'CONSUMPTION')
      AND m."occurredAt" >= ${zonedMidnight(historyDays[0]!)} AND m."occurredAt" < ${zonedMidnight(today)}
    GROUP BY 1, 2`;
  const usage = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const m = usage.get(r.productId) ?? new Map<number, number>();
    m.set(r.dow, Number(r.qty));
    usage.set(r.productId, m);
  }

  const [products, costs, pendingLines] = await Promise.all([
    db.product.findMany({
      where: {
        active: true,
        OR: [{ id: { in: [...usage.keys()] } }, { reorderPoint: { not: null } }],
      },
      include: {
        conversions: { include: { unit: { select: { symbol: true } } } },
        stockUnit: { select: { symbol: true } },
        purchaseUnit: { select: { symbol: true } },
        preferredSupplier: { select: { id: true, name: true } },
        supplierProducts: true,
      },
    }),
    db.stockCost.findMany({ where: { unitId: q.unitId } }),
    db.purchaseOrderLine.findMany({
      where: { order: { unitId: q.unitId, status: { in: ['SENT', 'PARTIAL'] } } },
    }),
  ]);
  const stock = new Map(costs.map((c) => [c.productId, c.qty.toNumber()]));

  const out = [];
  for (const p of products) {
    const factor = (unitId: string | null) =>
      !unitId || unitId === p.stockUnitId
        ? new D(1)
        : (p.conversions.find((c) => c.unitId === unitId)?.factor ?? new D(1));
    const pending = pendingLines
      .filter((l) => l.productId === p.id)
      .reduce((s, l) => s + D.max(l.qty.sub(l.receivedQty), 0).mul(factor(l.unitId)).toNumber(), 0);
    const onHand = stock.get(p.id) ?? 0;
    const expected = forecast(usage.get(p.id) ?? new Map(), historyDays, nextDays);
    let need = expected - onHand - pending;
    if (p.reorderPoint != null && onHand + pending <= p.reorderPoint.toNumber()) {
      need = Math.max(need, p.reorderPoint.toNumber() - onHand - pending, 0.001);
    }
    if (need <= 0) continue;
    const purchaseUnitId = p.purchaseUnitId ?? p.stockUnitId;
    const pf = factor(purchaseUnitId).toNumber();
    const qty = Math.ceil(need / pf - 1e-9);
    const sp = p.supplierProducts.find((s) => s.supplierId === p.preferredSupplierId);
    out.push({
      productId: p.id,
      code: p.code,
      name: p.name,
      stockUnit: p.stockUnit.symbol,
      onHand: Math.round(onHand * 1000) / 1000,
      pending: Math.round(pending * 1000) / 1000,
      forecast: Math.round(expected * 1000) / 1000,
      need: Math.round(need * 1000) / 1000,
      purchaseUnitId,
      purchaseUnit: p.purchaseUnit?.symbol ?? p.stockUnit.symbol,
      qty,
      supplier: p.preferredSupplier,
      lastPrice: sp?.lastPrice ?? null,
    });
  }
  return out.sort(
    (a, b) =>
      (a.supplier?.name ?? '~').localeCompare(b.supplier?.name ?? '~') ||
      a.name.localeCompare(b.name),
  );
}

/** Cria encomendas em rascunho (uma por fornecedor) a partir das linhas escolhidas. */
export async function createOrders(
  auth: AuthContext,
  input: {
    unitId: string;
    lines: {
      productId: string;
      unitId: string;
      qty: number;
      supplierId: string;
      unitPrice: number | null;
    }[];
  },
) {
  if (!input.lines.length) throw new AppError('VALIDATION_ERROR', 'Sem linhas');
  const bySupplier = new Map<string, typeof input.lines>();
  for (const l of input.lines)
    bySupplier.set(l.supplierId, [...(bySupplier.get(l.supplierId) ?? []), l]);
  const orders = [];
  for (const [supplierId, lines] of bySupplier) {
    const o = await saveOrder(auth, null, {
      supplierId,
      unitId: input.unitId,
      expectedDate: null,
      notes: 'Gerada pela sugestão de reposição',
      lines: lines.map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
    });
    orders.push({ id: o.id, number: o.number, supplier: o.supplier.name });
  }
  return orders;
}
