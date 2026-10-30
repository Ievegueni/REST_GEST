import { Prisma, type PurchaseOrderStatus } from '@prisma/client';
import type { z } from 'zod';
import { audit } from '../../core/audit';
import { assertUnitAccess, type AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import { nextNumber } from '../../core/sequence';
import { postMovements, reverseMovements, type Tx } from '../stock/engine';
import type { orderSchema, receiptSchema } from './schemas';
import { cancelForReceipt, createFromReceipt } from '../payables/service';

const D = Prisma.Decimal;

// ---------- Encomendas ----------

const orderInclude = {
  supplier: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true } },
  lines: {
    include: {
      product: { select: { id: true, code: true, name: true } },
      unit: { select: { id: true, symbol: true } },
    },
  },
  receipts: {
    select: { id: true, number: true, status: true, receivedAt: true, totalAmount: true },
  },
} as const;

export async function getOrder(auth: AuthContext, id: string) {
  const o = await auth.db.purchaseOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
  assertUnitAccess(auth, o.unitId);
  return o;
}

export async function saveOrder(
  auth: AuthContext,
  id: string | null,
  input: z.infer<typeof orderSchema>,
) {
  assertUnitAccess(auth, input.unitId);
  const { lines, ...data } = input;
  const orderId = await auth.db.$transaction(async (tx) => {
    let oid = id;
    if (oid) {
      const o = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: oid } });
      if (o.status !== 'DRAFT')
        throw new AppError('VALIDATION_ERROR', 'Só encomendas em rascunho podem ser editadas');
      await tx.purchaseOrder.update({ where: { id: oid }, data });
      await tx.purchaseOrderLine.deleteMany({ where: { orderId: oid } });
    } else {
      const number = await nextNumber(tx, auth.tenantId, 'PO');
      oid = (await tx.purchaseOrder.create({ data: { ...data, number, createdById: auth.userId } }))
        .id;
    }
    await tx.purchaseOrderLine.createMany({ data: lines.map((l) => ({ ...l, orderId: oid! })) });
    return oid;
  });
  return getOrder(auth, orderId);
}

export async function setOrderStatus(auth: AuthContext, id: string, status: 'SENT' | 'CANCELLED') {
  const o = await auth.db.purchaseOrder.findUniqueOrThrow({ where: { id } });
  assertUnitAccess(auth, o.unitId);
  const allowed: Record<string, PurchaseOrderStatus[]> = {
    SENT: ['DRAFT'],
    CANCELLED: ['DRAFT', 'SENT', 'PARTIAL'],
  };
  if (!allowed[status]!.includes(o.status)) {
    throw new AppError('VALIDATION_ERROR', `Não é possível passar de ${o.status} para ${status}`);
  }
  await auth.db.purchaseOrder.update({ where: { id }, data: { status } });
  return getOrder(auth, id);
}

/** Recalcula o estado da encomenda a partir das quantidades recebidas. */
async function refreshOrderStatus(tx: Tx, orderId: string) {
  const o = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true },
  });
  if (o.status === 'CANCELLED') return;
  const any = o.lines.some((l) => l.receivedQty.gt(0));
  const all = o.lines.every((l) => l.receivedQty.gte(l.qty));
  const status: PurchaseOrderStatus = all ? 'RECEIVED' : any ? 'PARTIAL' : 'SENT';
  if (status !== o.status)
    await tx.purchaseOrder.update({ where: { id: orderId }, data: { status } });
}

// ---------- Recepções ----------

const receiptInclude = {
  supplier: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, unitId: true, unit: { select: { name: true } } } },
  order: { select: { id: true, number: true } },
  lines: {
    include: {
      product: { select: { id: true, code: true, name: true } },
      unit: { select: { id: true, symbol: true } },
    },
  },
} as const;

export async function getReceipt(auth: AuthContext, id: string) {
  const r = await auth.db.goodsReceipt.findUniqueOrThrow({
    where: { id },
    include: receiptInclude,
  });
  assertUnitAccess(auth, r.location.unitId);
  return r;
}

export async function createReceipt(auth: AuthContext, input: z.infer<typeof receiptSchema>) {
  const db = auth.db;
  const location = await db.stockLocation.findUniqueOrThrow({ where: { id: input.locationId } });
  assertUnitAccess(auth, location.unitId);

  if (input.orderId) {
    const order = await db.purchaseOrder.findUniqueOrThrow({
      where: { id: input.orderId },
      include: { lines: true },
    });
    if (order.supplierId !== input.supplierId)
      throw new AppError('VALIDATION_ERROR', 'Fornecedor diferente da encomenda');
    if (order.unitId !== location.unitId)
      throw new AppError('VALIDATION_ERROR', 'Local fora da unidade da encomenda');
    if (!['DRAFT', 'SENT', 'PARTIAL'].includes(order.status)) {
      throw new AppError('VALIDATION_ERROR', 'Encomenda já recebida ou cancelada');
    }
    for (const l of input.lines) {
      if (!l.orderLineId) continue;
      const ol = order.lines.find((x) => x.id === l.orderLineId);
      if (!ol) throw new AppError('VALIDATION_ERROR', 'Linha de encomenda inválida');
      if (ol.productId !== l.productId || ol.unitId !== l.unitId) {
        throw new AppError('VALIDATION_ERROR', 'Produto/unidade diferentes da linha de encomenda');
      }
    }
  } else if (input.lines.some((l) => l.orderLineId)) {
    throw new AppError('VALIDATION_ERROR', 'Linha de encomenda sem encomenda');
  }

  const lines = input.lines.map((l) => ({
    ...l,
    total: new D(l.qty).mul(l.unitPrice).toDecimalPlaces(0).toNumber(),
  }));
  const totalAmount = lines.reduce((s, l) => s + l.total, 0);
  const receivedAt = input.receivedAt ?? new Date();

  const id = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx, auth.tenantId, 'GR');
    const header = { ...input, lines: undefined };
    const r = await tx.goodsReceipt.create({
      data: { ...header, receivedAt, number, totalAmount, createdById: auth.userId },
    });
    await tx.goodsReceiptLine.createMany({ data: lines.map((l) => ({ ...l, receiptId: r.id })) });

    await postMovements(
      tx,
      lines.map((l) => ({
        productId: l.productId,
        locationId: input.locationId,
        type: 'PURCHASE_IN' as const,
        qty: l.qty,
        unitId: l.unitId,
        unitCost: l.unitPrice,
        lot: l.lotCode ? { code: l.lotCode, expiryDate: l.expiryDate } : null,
      })),
      {
        tenantId: auth.tenantId,
        userId: auth.userId,
        refType: 'GoodsReceipt',
        refId: r.id,
        occurredAt: receivedAt,
      },
    );

    if (input.orderId) {
      for (const l of lines.filter((l) => l.orderLineId)) {
        await tx.purchaseOrderLine.update({
          where: { id: l.orderLineId! },
          data: { receivedQty: { increment: l.qty } },
        });
      }
      await refreshOrderStatus(tx, input.orderId);
    }
    await updateSupplierPrices(tx, input.supplierId, lines, receivedAt);
    if (auth.features.has('payables'))
      await createFromReceipt(tx, { ...r, unitId: location.unitId });
    return r.id;
  });
  return getReceipt(auth, id);
}

/** Último preço do fornecedor, guardado por unidade de compra do produto. */
async function updateSupplierPrices(
  tx: Tx,
  supplierId: string,
  lines: { productId: string; unitId: string; unitPrice: number }[],
  at: Date,
) {
  const products = await tx.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) } },
    include: { conversions: true },
  });
  for (const l of lines) {
    const p = products.find((x) => x.id === l.productId)!;
    const factor = (unitId: string | null) =>
      !unitId || unitId === p.stockUnitId
        ? new D(1)
        : (p.conversions.find((c) => c.unitId === unitId)?.factor ?? new D(1));
    const perStock = new D(l.unitPrice).div(factor(l.unitId));
    const lastPrice = perStock.mul(factor(p.purchaseUnitId)).toDecimalPlaces(0).toNumber();
    await tx.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId: l.productId } },
      create: { supplierId, productId: l.productId, lastPrice, lastPriceAt: at },
      update: { lastPrice, lastPriceAt: at },
    });
  }
}

/** Anula a recepção: estorna os movimentos e devolve as quantidades à encomenda. */
export async function cancelReceipt(auth: AuthContext, id: string, ip?: string) {
  const db = auth.db;
  const r = await db.goodsReceipt.findUniqueOrThrow({
    where: { id },
    include: { lines: true, location: true },
  });
  assertUnitAccess(auth, r.location.unitId);
  if (r.status !== 'POSTED') throw new AppError('VALIDATION_ERROR', 'Recepção já anulada');

  await db.$transaction(async (tx) => {
    const movements = await tx.stockMovement.findMany({
      where: { refType: 'GoodsReceipt', refId: id, reversalOfId: null },
      select: { id: true },
    });
    await reverseMovements(
      tx,
      movements.map((m) => m.id),
      { tenantId: auth.tenantId, userId: auth.userId, refType: 'GoodsReceipt', refId: id },
    );
    for (const l of r.lines.filter((l) => l.orderLineId)) {
      await tx.purchaseOrderLine.update({
        where: { id: l.orderLineId! },
        data: { receivedQty: { decrement: l.qty } },
      });
    }
    if (r.orderId) await refreshOrderStatus(tx, r.orderId);
    await cancelForReceipt(tx, id);
    await tx.goodsReceipt.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: auth.userId },
    });
  });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'receipt.cancel',
    entity: 'GoodsReceipt',
    entityId: id,
    ip,
  });
  return getReceipt(auth, id);
}
