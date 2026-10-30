import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { audit } from '../../core/audit';
import { assertUnitAccess, type AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import { nextNumber } from '../../core/sequence';
import { lockCosts, postMovements } from '../stock/engine';
import { evaluateInventory } from '../alerts/engine';
import type { countSchema, openSchema } from './schemas';

const D = Prisma.Decimal;
const REF = 'InventoryCount';

async function load(auth: AuthContext, id: string) {
  const c = await auth.db.inventoryCount.findUniqueOrThrow({
    where: { id },
    include: {
      location: {
        select: { id: true, name: true, unitId: true, unit: { select: { name: true } } },
      },
      category: { select: { name: true } },
    },
  });
  assertUnitAccess(auth, c.location.unitId);
  return c;
}

/** Contagem com linhas e, enquanto aberta, o teórico actual e o custo médio (para a revisão). */
export async function getCount(auth: AuthContext, id: string) {
  const c = await load(auth, id);
  const lines = await auth.db.inventoryCountLine.findMany({
    where: { countId: id },
    include: {
      product: {
        select: {
          id: true,
          code: true,
          name: true,
          stockUnit: { select: { symbol: true } },
          category: { select: { name: true } },
        },
      },
    },
    orderBy: { product: { name: 'asc' } },
  });
  if (c.status !== 'OPEN') return { ...c, lines };

  const productIds = lines.map((l) => l.productId);
  const [balances, costs] = await Promise.all([
    auth.db.stockBalance.findMany({
      where: { locationId: c.locationId, productId: { in: productIds } },
    }),
    auth.db.stockCost.findMany({
      where: { unitId: c.location.unitId, productId: { in: productIds } },
    }),
  ]);
  const bal = new Map(balances.map((b) => [b.productId, b.qty]));
  const avg = new Map(costs.map((x) => [x.productId, x.avgCost]));
  return {
    ...c,
    lines: lines.map((l) => ({
      ...l,
      expectedQty: bal.get(l.productId) ?? new D(0),
      unitCost: avg.get(l.productId) ?? new D(0),
    })),
  };
}

/** Abre contagem: produtos com saldo ou limite no local (filtrados pela categoria e descendentes). */
export async function openCount(auth: AuthContext, input: z.infer<typeof openSchema>) {
  const db = auth.db;
  const location = await db.stockLocation.findUniqueOrThrow({ where: { id: input.locationId } });
  assertUnitAccess(auth, location.unitId);
  if (
    await db.inventoryCount.findFirst({ where: { locationId: input.locationId, status: 'OPEN' } })
  ) {
    throw new AppError('CONFLICT', 'Já existe uma contagem aberta neste local');
  }

  let categoryIds: string[] | null = null;
  if (input.categoryId) {
    const cats = await db.category.findMany({ select: { id: true, parentId: true } });
    categoryIds = [input.categoryId];
    for (let i = 0; i < categoryIds.length; i++) {
      categoryIds.push(...cats.filter((c) => c.parentId === categoryIds![i]).map((c) => c.id));
    }
  }
  const products = await db.product.findMany({
    where: {
      active: true,
      ...(categoryIds && { categoryId: { in: categoryIds } }),
      OR: [
        { balances: { some: { locationId: input.locationId } } },
        { locationLimits: { some: { locationId: input.locationId } } },
      ],
    },
    select: { id: true },
  });

  const id = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx, auth.tenantId, 'INV');
    const c = await tx.inventoryCount.create({
      data: { ...input, number, openedById: auth.userId },
    });
    await tx.inventoryCountLine.createMany({
      data: products.map((p) => ({ countId: c.id, productId: p.id })),
    });
    return c.id;
  });
  return getCount(auth, id);
}

export async function saveCounts(
  auth: AuthContext,
  id: string,
  input: z.infer<typeof countSchema>,
) {
  const c = await load(auth, id);
  if (c.status !== 'OPEN') throw new AppError('VALIDATION_ERROR', 'Contagem fechada');
  const now = new Date();
  await auth.db.$transaction(async (tx) => {
    for (const l of input.lines) {
      const data = {
        countedQty: l.countedQty,
        countedById: l.countedQty == null ? null : auth.userId,
        countedAt: l.countedQty == null ? null : now,
      };
      await tx.inventoryCountLine.upsert({
        where: { countId_productId: { countId: id, productId: l.productId } },
        create: { countId: id, productId: l.productId, ...data },
        update: data,
      });
    }
  });
  return getCount(auth, id);
}

/** Fecha: acerta cada linha contada ao valor contado (INVENTORY_ADJUST). Linhas não contadas são ignoradas. */
export async function closeCount(auth: AuthContext, id: string, ip?: string) {
  const c = await load(auth, id);
  if (c.status !== 'OPEN') throw new AppError('VALIDATION_ERROR', 'Contagem já fechada');

  await auth.db.$transaction(
    async (tx) => {
      const lines = await tx.inventoryCountLine.findMany({
        where: { countId: id, countedQty: { not: null } },
      });
      // Bloqueia antes de ler os saldos: nenhum movimento entra entre a leitura e o acerto.
      const costs = await lockCosts(
        tx,
        auth.tenantId,
        lines.map((l) => ({ productId: l.productId, unitId: c.location.unitId })),
      );
      const balances = new Map(
        (
          await tx.stockBalance.findMany({
            where: { locationId: c.locationId, productId: { in: lines.map((l) => l.productId) } },
          })
        ).map((b) => [b.productId, b.qty]),
      );
      const inputs = [];
      for (const l of lines) {
        const expected = balances.get(l.productId) ?? new D(0);
        const diff = l.countedQty!.sub(expected);
        await tx.inventoryCountLine.update({
          where: { id: l.id },
          data: {
            expectedQty: expected,
            unitCost: costs.get(`${l.productId}|${c.location.unitId}`)!.avgCost,
          },
        });
        if (!diff.isZero()) {
          inputs.push({
            productId: l.productId,
            locationId: c.locationId,
            type: 'INVENTORY_ADJUST' as const,
            qty: diff,
            lot: { code: `INV-${c.number}` }, // sobras de produtos com lote
            reason: `Inventário nº ${c.number}`,
          });
        }
      }
      await postMovements(tx, inputs, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        refType: REF,
        refId: id,
      });
      await tx.inventoryCount.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: auth.userId },
      });
    },
    { timeout: 120_000 },
  );
  if (auth.features.has('alerts_sms')) await evaluateInventory(auth.db, auth.tenantId, id);
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'inventory.close',
    entity: 'InventoryCount',
    entityId: id,
    ip,
  });
  return getCount(auth, id);
}

export async function cancelCount(auth: AuthContext, id: string) {
  const c = await load(auth, id);
  if (c.status !== 'OPEN') throw new AppError('VALIDATION_ERROR', 'Contagem já fechada');
  await auth.db.inventoryCount.update({ where: { id }, data: { status: 'CANCELLED' } });
  return getCount(auth, id);
}
