/**
 * Motor de stock: único ponto que escreve StockMovement/StockBalance/StockCost.
 * Outros módulos (compras, transferências, inventário, vendas) chamam postMovements dentro
 * da sua própria transacção, para o documento e os movimentos serem atómicos.
 */
import { Prisma, type MovementType } from '@prisma/client';
import { AppError } from '../../core/errors';
import type { TenantDb } from '../../core/prisma';
import { stockCheckJob } from '../alerts/jobs';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export type Tx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0];

const IN_TYPES: MovementType[] = ['PURCHASE_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN'];
const OUT_TYPES: MovementType[] = [
  'SALE_OUT',
  'CONSUMPTION',
  'WASTE',
  'TRANSFER_OUT',
  'ADJUSTMENT_OUT',
  'RETURN_SUPPLIER',
];

export type MovementInput = {
  productId: string;
  locationId: string;
  type: MovementType;
  /** positiva; INVENTORY_ADJUST (+ sobra, − falta) e SALE_OUT (− = devolução) aceitam sinal */
  qty: number | Decimal;
  /** unidade em que qty/unitCost vêm (omisso = unidade de stock) */
  unitId?: string | null;
  /** custo por `unitId` (entradas). Omisso = custo médio actual */
  unitCost?: number | Decimal | null;
  lotId?: string | null;
  /** entrada de produto com lote: cria/reutiliza pelo código */
  lot?: { code: string; expiryDate?: Date | null } | null;
  reason?: string | null;
};

export type MovementMeta = {
  tenantId: string;
  userId: string | null;
  refType?: string | null;
  refId?: string | null;
  occurredAt?: Date;
};

/** Parte já normalizada: unidade de stock, sinal, lote resolvido. */
type Part = {
  productId: string;
  locationId: string;
  unitId: string;
  type: MovementType;
  q: Decimal;
  unitCost: Decimal | null;
  lotId: string | null;
  fefo: boolean;
  reason: string | null;
  reversalOfId: string | null;
  /** estorno de uma entrada: retira quantidade ao custo original */
  removesInbound: boolean;
};

type CostRow = { qty: Decimal; avgCost: Decimal };

export async function postMovements(tx: Tx, inputs: MovementInput[], meta: MovementMeta) {
  if (!inputs.length) return [];
  const products = new Map(
    (
      await tx.product.findMany({
        where: { id: { in: [...new Set(inputs.map((i) => i.productId))] } },
        include: { conversions: true },
      })
    ).map((p) => [p.id, p]),
  );
  const locations = new Map(
    (
      await tx.stockLocation.findMany({
        where: { id: { in: [...new Set(inputs.map((i) => i.locationId))] } },
      })
    ).map((l) => [l.id, l]),
  );

  const parts: Part[] = [];
  for (const i of inputs) {
    const p = products.get(i.productId);
    const loc = locations.get(i.locationId);
    if (!p) throw new AppError('VALIDATION_ERROR', 'Produto inválido', { productId: i.productId });
    if (!loc)
      throw new AppError('VALIDATION_ERROR', 'Local inválido', { locationId: i.locationId });
    if (!p.active) throw new AppError('VALIDATION_ERROR', `Produto inactivo: ${p.name}`);
    if (!loc.active) throw new AppError('VALIDATION_ERROR', `Local inactivo: ${loc.name}`);

    let factor = new D(1);
    if (i.unitId && i.unitId !== p.stockUnitId) {
      const c = p.conversions.find((c) => c.unitId === i.unitId);
      if (!c) throw new AppError('VALIDATION_ERROR', `Sem conversão de unidade para ${p.name}`);
      factor = c.factor;
    }
    const raw = new D(i.qty);
    // INVENTORY_ADJUST e SALE_OUT aceitam sinal (venda negativa = devolução no POS)
    if (raw.isZero() || (i.type !== 'INVENTORY_ADJUST' && i.type !== 'SALE_OUT' && raw.lt(0))) {
      throw new AppError('VALIDATION_ERROR', 'Quantidade inválida', { productId: p.id });
    }
    const sign = IN_TYPES.includes(i.type) ? 1 : OUT_TYPES.includes(i.type) ? -1 : 1;
    const q = raw.mul(factor).mul(sign).toDecimalPlaces(3);
    if (q.isZero()) throw new AppError('VALIDATION_ERROR', 'Quantidade demasiado pequena');
    const unitCost = i.unitCost == null ? null : new D(i.unitCost).div(factor);

    let lotId = i.lotId ?? null;
    if (lotId && !(await tx.lot.findFirst({ where: { id: lotId, productId: p.id } }))) {
      throw new AppError('VALIDATION_ERROR', 'Lote inválido para o produto');
    }
    if (p.tracksLots && q.gt(0) && !lotId) {
      if (!i.lot?.code) throw new AppError('VALIDATION_ERROR', `Lote obrigatório para ${p.name}`);
      const lot = await tx.lot.upsert({
        where: {
          tenantId_productId_code: { tenantId: meta.tenantId, productId: p.id, code: i.lot.code },
        },
        update: {},
        create: { productId: p.id, code: i.lot.code, expiryDate: i.lot.expiryDate ?? null },
      });
      lotId = lot.id;
    }
    parts.push({
      productId: p.id,
      locationId: loc.id,
      unitId: loc.unitId,
      type: i.type,
      q,
      unitCost,
      lotId,
      fefo: p.tracksLots && q.lt(0) && !lotId,
      reason: i.reason ?? null,
      reversalOfId: null,
      removesInbound: false,
    });
  }
  return post(tx, parts, meta);
}

/** Estorna um movimento (gera o simétrico). Um movimento só pode ser estornado uma vez. */
export async function reverseMovements(tx: Tx, movementIds: string[], meta: MovementMeta) {
  const originals = await tx.stockMovement.findMany({
    where: { id: { in: movementIds } },
    include: { location: true, reversedBy: { select: { id: true } } },
  });
  if (originals.length !== movementIds.length)
    throw new AppError('NOT_FOUND', 'Movimento não encontrado');
  for (const m of originals) {
    if (m.reversalOfId) throw new AppError('VALIDATION_ERROR', 'Um estorno não pode ser estornado');
    if (m.reversedBy) throw new AppError('CONFLICT', 'Movimento já estornado');
  }
  return post(
    tx,
    originals.map((m) => ({
      productId: m.productId,
      locationId: m.locationId,
      unitId: m.location.unitId,
      type: m.type,
      q: m.qty.neg(),
      unitCost: m.unitCost,
      lotId: m.lotId,
      fefo: false,
      reason: m.reason,
      reversalOfId: m.id,
      removesInbound: m.qty.gt(0),
    })),
    meta,
  );
}

async function post(tx: Tx, parts: Part[], meta: MovementMeta) {
  const occurredAt = meta.occurredAt ?? new Date();
  if (occurredAt.getTime() > Date.now() + 60_000) {
    throw new AppError('VALIDATION_ERROR', 'Data do movimento no futuro');
  }

  const costs = await lockCosts(
    tx,
    meta.tenantId,
    parts.map((p) => ({ productId: p.productId, unitId: p.unitId })),
  );

  if (meta.refType !== 'InventoryCount') {
    const counting = await tx.inventoryCount.findFirst({
      where: {
        status: 'OPEN',
        blocksMovements: true,
        locationId: { in: [...new Set(parts.map((p) => p.locationId))] },
      },
      include: { location: { select: { name: true } } },
    });
    if (counting) {
      throw new AppError('CONFLICT', `Local em contagem de inventário: ${counting.location.name}`);
    }
  }

  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: meta.tenantId } });
  const block = tenant.negativeStockPolicy === 'BLOCK';

  const expanded: Part[] = [];
  for (const part of parts) expanded.push(...(part.fefo ? await allocateFefo(tx, part) : [part]));

  const created = [];
  for (const part of expanded) {
    const key = `${part.productId}|${part.unitId}`;
    const cost = costs.get(key)!;
    const { q } = part;

    // Custo médio ponderado
    let unitCost: Decimal;
    let avg = cost.avgCost;
    if (q.gt(0)) {
      unitCost = part.unitCost ?? cost.avgCost;
      avg = cost.qty.lte(0)
        ? unitCost
        : cost.qty.mul(cost.avgCost).add(q.mul(unitCost)).div(cost.qty.add(q));
    } else if (part.removesInbound) {
      unitCost = part.unitCost!;
      const remaining = cost.qty.add(q);
      if (remaining.gt(0)) avg = cost.qty.mul(cost.avgCost).add(q.mul(unitCost)).div(remaining);
    } else {
      unitCost = cost.avgCost;
    }
    costs.set(key, { qty: cost.qty.add(q), avgCost: avg.toDecimalPlaces(4) });

    const balance = await tx.stockBalance.upsert({
      where: { productId_locationId: { productId: part.productId, locationId: part.locationId } },
      create: { productId: part.productId, locationId: part.locationId, qty: q },
      update: { qty: { increment: q } },
    });
    if (block && q.lt(0) && balance.qty.lt(0)) {
      throw new AppError('CONFLICT', 'Stock insuficiente', {
        productId: part.productId,
        locationId: part.locationId,
        available: balance.qty.sub(q).toString(),
      });
    }
    if (part.lotId) {
      const lb = await tx.stockLotBalance.upsert({
        where: { lotId_locationId: { lotId: part.lotId, locationId: part.locationId } },
        create: {
          productId: part.productId,
          locationId: part.locationId,
          lotId: part.lotId,
          qty: q,
        },
        update: { qty: { increment: q } },
      });
      if (block && q.lt(0) && lb.qty.lt(0)) {
        throw new AppError('CONFLICT', 'Stock insuficiente no lote', { lotId: part.lotId });
      }
    }

    created.push(
      await tx.stockMovement.create({
        data: {
          productId: part.productId,
          locationId: part.locationId,
          lotId: part.lotId,
          type: part.type,
          qty: q,
          unitCost: unitCost.toDecimalPlaces(4),
          totalCost: q.mul(unitCost).toDecimalPlaces(0).toNumber(),
          balanceAfter: balance.qty,
          reason: part.reason,
          refType: meta.refType ?? null,
          refId: meta.refId ?? null,
          reversalOfId: part.reversalOfId,
          userId: meta.userId,
          occurredAt,
        },
      }),
    );
  }

  for (const [key, c] of costs) {
    const [productId, unitId] = key.split('|') as [string, string];
    await tx.stockCost.update({
      where: { productId_unitId: { productId, unitId } },
      data: { qty: c.qty, avgCost: c.avgCost },
    });
  }
  // Alertas de mínimo/máximo: avaliados fora da transacção (atraso para correr após o commit; idempotente).
  const pairs = [...new Set(parts.map((p) => `${p.productId}|${p.locationId}`))].map((k) => {
    const [productId, locationId] = k.split('|') as [string, string];
    return { productId, locationId };
  });
  await stockCheckJob.enqueue({ tenantId: meta.tenantId, pairs }, { delay: 1500 });
  return created;
}

/**
 * Bloqueia (SELECT … FOR UPDATE) o custo de cada (produto, unidade), sempre pela mesma ordem.
 * Serializa todos os movimentos de um produto numa unidade. Reentrante na mesma transacção.
 */
export async function lockCosts(
  tx: Tx,
  tenantId: string,
  pairs: { productId: string; unitId: string }[],
) {
  const keys = [...new Set(pairs.map((p) => `${p.productId}|${p.unitId}`))].sort();
  const costs = new Map<string, CostRow>();
  for (const key of keys) {
    const [productId, unitId] = key.split('|') as [string, string];
    await tx.$executeRaw`
      INSERT INTO "StockCost" ("tenantId", "productId", "unitId", "qty", "avgCost", "updatedAt")
      VALUES (${tenantId}, ${productId}, ${unitId}, 0, 0, now())
      ON CONFLICT DO NOTHING`;
    const [row] = await tx.$queryRaw<CostRow[]>`
      SELECT "qty", "avgCost" FROM "StockCost"
      WHERE "tenantId" = ${tenantId} AND "productId" = ${productId} AND "unitId" = ${unitId}
      FOR UPDATE`;
    costs.set(key, { qty: new D(row!.qty), avgCost: new D(row!.avgCost) });
  }
  return costs;
}

/** FEFO: reparte a saída pelos lotes com validade mais próxima; o resto fica sem lote. */
async function allocateFefo(tx: Tx, part: Part): Promise<Part[]> {
  const lots = await tx.stockLotBalance.findMany({
    where: { productId: part.productId, locationId: part.locationId, qty: { gt: 0 } },
    include: { lot: true },
  });
  lots.sort(
    (a, b) =>
      (a.lot.expiryDate?.getTime() ?? Infinity) - (b.lot.expiryDate?.getTime() ?? Infinity) ||
      a.lot.code.localeCompare(b.lot.code),
  );
  let need = part.q.neg();
  const out: Part[] = [];
  for (const lb of lots) {
    if (need.lte(0)) break;
    const take = D.min(need, lb.qty);
    out.push({ ...part, q: take.neg(), lotId: lb.lotId, fefo: false });
    need = need.sub(take);
  }
  if (need.gt(0)) out.push({ ...part, q: need.neg(), lotId: null, fefo: false });
  return out;
}
