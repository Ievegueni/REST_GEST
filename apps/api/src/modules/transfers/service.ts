import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { assertUnitAccess, type AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import { nextNumber } from '../../core/sequence';
import { postMovements, reverseMovements, type MovementInput } from '../stock/engine';
import type { receiveSchema, transferSchema } from './schemas';

const D = Prisma.Decimal;
const REF = 'Transfer';

const include = {
  fromLocation: {
    select: { id: true, name: true, unitId: true, unit: { select: { name: true } } },
  },
  toLocation: { select: { id: true, name: true, unitId: true, unit: { select: { name: true } } } },
  lines: {
    include: {
      product: {
        select: { id: true, code: true, name: true, stockUnit: { select: { symbol: true } } },
      },
    },
  },
} as const;

/** Visível para quem tem acesso à origem ou ao destino. */
export async function getTransfer(auth: AuthContext, id: string) {
  const t = await auth.db.transfer.findUniqueOrThrow({ where: { id }, include });
  try {
    assertUnitAccess(auth, t.fromLocation.unitId);
  } catch {
    assertUnitAccess(auth, t.toLocation.unitId);
  }
  return t;
}

export async function createTransfer(auth: AuthContext, input: z.infer<typeof transferSchema>) {
  const db = auth.db;
  if (input.fromLocationId === input.toLocationId)
    throw new AppError('VALIDATION_ERROR', 'Origem e destino iguais');
  const [from] = await Promise.all([
    db.stockLocation.findUniqueOrThrow({ where: { id: input.fromLocationId } }),
    db.stockLocation.findUniqueOrThrow({ where: { id: input.toLocationId } }),
  ]);
  assertUnitAccess(auth, from.unitId);
  if (new Set(input.lines.map((l) => l.productId)).size !== input.lines.length) {
    throw new AppError('VALIDATION_ERROR', 'Produto repetido na transferência');
  }

  // Quantidades guardadas na unidade de stock.
  const products = await db.product.findMany({
    where: { id: { in: input.lines.map((l) => l.productId) } },
    include: { conversions: true },
  });
  const lines = input.lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    if (!p) throw new AppError('VALIDATION_ERROR', 'Produto inválido');
    let factor = new D(1);
    if (l.unitId && l.unitId !== p.stockUnitId) {
      const c = p.conversions.find((c) => c.unitId === l.unitId);
      if (!c) throw new AppError('VALIDATION_ERROR', `Sem conversão de unidade para ${p.name}`);
      factor = c.factor;
    }
    return { productId: l.productId, qty: new D(l.qty).mul(factor).toDecimalPlaces(3) };
  });

  const id = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx, auth.tenantId, 'TR');
    const t = await tx.transfer.create({
      data: {
        number,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        notes: input.notes,
        createdById: auth.userId,
      },
    });
    await tx.transferLine.createMany({ data: lines.map((l) => ({ ...l, transferId: t.id })) });
    return t.id;
  });
  return getTransfer(auth, id);
}

/** PENDENTE → ENVIADA: sai da origem (FEFO) e fixa o custo de saída por linha. */
export async function sendTransfer(auth: AuthContext, id: string) {
  const t = await getTransfer(auth, id);
  assertUnitAccess(auth, t.fromLocation.unitId);
  if (t.status !== 'PENDING')
    throw new AppError('VALIDATION_ERROR', 'Transferência já enviada ou cancelada');

  await auth.db.$transaction(async (tx) => {
    const out = await postMovements(
      tx,
      t.lines.map((l) => ({
        productId: l.productId,
        locationId: t.fromLocationId,
        type: 'TRANSFER_OUT' as const,
        qty: l.qty,
      })),
      { tenantId: auth.tenantId, userId: auth.userId, refType: REF, refId: id },
    );
    for (const l of t.lines) {
      const ms = out.filter((m) => m.productId === l.productId);
      const total = ms.reduce((s, m) => s.add(m.qty.mul(m.unitCost)), new D(0)).neg();
      await tx.transferLine.update({
        where: { id: l.id },
        data: { sentQty: l.qty, unitCost: total.div(l.qty).toDecimalPlaces(4) },
      });
    }
    await tx.transfer.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentById: auth.userId },
    });
  });
  return getTransfer(auth, id);
}

/**
 * ENVIADA → RECEBIDA: entra no destino ao custo de saída e com os mesmos lotes.
 * Diferenças (enviado − recebido) ficam registadas na linha.
 */
export async function receiveTransfer(
  auth: AuthContext,
  id: string,
  input: z.infer<typeof receiveSchema>,
) {
  const t = await getTransfer(auth, id);
  assertUnitAccess(auth, t.toLocation.unitId);
  if (t.status !== 'SENT') throw new AppError('VALIDATION_ERROR', 'Transferência não está enviada');

  const received = new Map(input.lines.map((l) => [l.lineId, new D(l.receivedQty)]));
  for (const l of t.lines) {
    const r = received.get(l.id);
    if (!r) throw new AppError('VALIDATION_ERROR', 'Falta a quantidade recebida de uma linha');
    if (r.gt(l.sentQty!)) throw new AppError('VALIDATION_ERROR', 'Recebido maior que o enviado');
  }

  await auth.db.$transaction(async (tx) => {
    const outs = await tx.stockMovement.findMany({
      where: { refType: REF, refId: id, type: 'TRANSFER_OUT', reversalOfId: null },
      orderBy: { createdAt: 'asc' },
    });
    const inputs: MovementInput[] = [];
    for (const l of t.lines) {
      let left = received.get(l.id)!;
      for (const m of outs.filter((m) => m.productId === l.productId)) {
        if (left.lte(0)) break;
        const q = D.min(left, m.qty.neg());
        inputs.push({
          productId: l.productId,
          locationId: t.toLocationId,
          type: 'TRANSFER_IN',
          qty: q,
          unitCost: m.unitCost,
          lotId: m.lotId,
          // saída sem lote (stock negativo) de produto com lote: lote técnico
          lot: m.lotId ? null : { code: `TR-${t.number}` },
        });
        left = left.sub(q);
      }
      await tx.transferLine.update({
        where: { id: l.id },
        data: { receivedQty: received.get(l.id) },
      });
    }
    await postMovements(tx, inputs, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      refType: REF,
      refId: id,
    });
    await tx.transfer.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date(), receivedById: auth.userId },
    });
  });
  return getTransfer(auth, id);
}

/** Cancela: pendente sem efeitos; enviada → devolve o stock à origem (estorno). */
export async function cancelTransfer(auth: AuthContext, id: string) {
  const t = await getTransfer(auth, id);
  assertUnitAccess(auth, t.fromLocation.unitId);
  if (!['PENDING', 'SENT'].includes(t.status))
    throw new AppError('VALIDATION_ERROR', 'Transferência já recebida ou cancelada');
  await auth.db.$transaction(async (tx) => {
    if (t.status === 'SENT') {
      const outs = await tx.stockMovement.findMany({
        where: { refType: REF, refId: id, reversalOfId: null },
        select: { id: true },
      });
      await reverseMovements(
        tx,
        outs.map((m) => m.id),
        { tenantId: auth.tenantId, userId: auth.userId, refType: REF, refId: id },
      );
    }
    await tx.transfer.update({ where: { id }, data: { status: 'CANCELLED' } });
  });
  return getTransfer(auth, id);
}
