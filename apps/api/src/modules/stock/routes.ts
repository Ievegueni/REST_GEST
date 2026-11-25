import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertUnitAccess, canAccessUnit, protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import { postMovements, reverseMovements } from './engine';
import { balancesQuery, kardexQuery, manualMovementSchema } from './schemas';

export async function stockRoutes(app: FastifyInstance) {
  const view = protect({ feature: 'stock', permission: 'stock.view' });
  const move = protect({ feature: 'stock', permission: 'stock.move' });
  const adjust = protect({ feature: 'stock', permission: 'stock.adjust' });

  // ---- Motivos de quebra (lista do tenant)
  app.get('/waste-reasons', protect({ feature: 'stock' }), async (req) => ({
    data: await req.auth.db.wasteReason.findMany({ orderBy: { name: 'asc' } }),
  }));
  const reasonSchema = z.object({
    name: z.string().trim().min(1).max(100),
    active: z.boolean().default(true),
  });
  app.post(
    '/waste-reasons',
    protect({ feature: 'stock', permission: 'settings.manage' }),
    async (req, reply) =>
      reply.status(201).send({
        data: await req.auth.db.wasteReason.create({ data: reasonSchema.parse(req.body) }),
      }),
  );
  app.patch(
    '/waste-reasons/:id',
    protect({ feature: 'stock', permission: 'settings.manage' }),
    async (req) => ({
      data: await req.auth.db.wasteReason.update({
        where: { id: idParam.parse(req.params).id },
        data: reasonSchema.partial().parse(req.body),
      }),
    }),
  );

  /** Movimentos manuais: entradas sem documento, consumos, quebras e ajustes. */
  app.post('/stock/movements', move, async (req, reply) => {
    const body = manualMovementSchema.parse(req.body);
    if (
      body.items.some((i) => i.type.startsWith('ADJUSTMENT')) &&
      !req.auth.permissions.has('stock.adjust')
    ) {
      throw new AppError('FORBIDDEN', 'Sem permissão para ajustes', { permission: 'stock.adjust' });
    }
    const db = req.auth.db;
    const location = await db.stockLocation.findUniqueOrThrow({ where: { id: body.locationId } });
    assertUnitAccess(req.auth, location.unitId);

    // Quebras: se o tenant definiu motivos, o motivo tem de ser um deles (relatórios por motivo).
    if (body.items.some((i) => i.type === 'WASTE')) {
      const reasons = await db.wasteReason.findMany({ where: { active: true } });
      const names = new Set(reasons.map((r) => r.name));
      const bad = body.items.find(
        (i) => i.type === 'WASTE' && reasons.length && !names.has((i.reason ?? body.reason)!),
      );
      if (bad) throw new AppError('VALIDATION_ERROR', 'Escolha um motivo de quebra da lista');
    }

    const movements = await db.$transaction((tx) =>
      postMovements(
        tx,
        body.items.map((i) => ({
          productId: i.productId,
          locationId: body.locationId,
          type: i.type,
          qty: i.qty,
          unitId: i.unitId,
          unitCost: i.unitCost,
          lotId: i.lotId,
          lot: i.lotCode ? { code: i.lotCode, expiryDate: i.expiryDate ?? null } : null,
          reason: i.reason ?? body.reason,
        })),
        { tenantId: req.auth.tenantId, userId: req.auth.userId, occurredAt: body.occurredAt },
      ),
    );
    return reply.status(201).send({ data: movements });
  });

  /** Estorno de movimento manual. Movimentos de documentos estornam-se pelo documento. */
  app.post('/stock/movements/:id/reverse', adjust, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const db = req.auth.db;
    const m = await db.stockMovement.findUniqueOrThrow({
      where: { id },
      include: { location: true },
    });
    assertUnitAccess(req.auth, m.location.unitId);
    if (m.refType)
      throw new AppError('VALIDATION_ERROR', 'Este movimento é estornado pelo documento de origem');
    const [reversal] = await db.$transaction((tx) =>
      reverseMovements(tx, [id], { tenantId: req.auth.tenantId, userId: req.auth.userId }),
    );
    return reply.status(201).send({ data: reversal });
  });

  /** Stock actual por local, com custo médio da unidade, valor e limites. */
  app.get('/stock/balances', view, async (req) => {
    const q = balancesQuery.parse(req.query);
    const db = req.auth.db;
    const rows = await db.stockBalance.findMany({
      where: {
        ...(q.locationId && { locationId: q.locationId }),
        ...(q.unitId && { location: { unitId: q.unitId } }),
        product: {
          active: true,
          ...(q.categoryId && { categoryId: q.categoryId }),
          ...(q.search && {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }),
        },
      },
      include: {
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            category: { select: { name: true } },
            stockUnit: { select: { symbol: true } },
          },
        },
        location: {
          select: { id: true, name: true, unitId: true, unit: { select: { name: true } } },
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { location: { name: 'asc' } }],
    });
    const visible = rows.filter((r) => canAccessUnit(req.auth, r.location.unitId));
    const productIds = [...new Set(visible.map((r) => r.productId))];
    const [costs, limits] = await Promise.all([
      db.stockCost.findMany({ where: { productId: { in: productIds } } }),
      db.productLocationLimit.findMany({ where: { productId: { in: productIds } } }),
    ]);
    const avg = new Map(costs.map((c) => [`${c.productId}|${c.unitId}`, c.avgCost]));
    const lim = new Map(limits.map((l) => [`${l.productId}|${l.locationId}`, l]));

    const data = visible
      .map((r) => {
        const avgCost = avg.get(`${r.productId}|${r.location.unitId}`) ?? new Prisma.Decimal(0);
        const l = lim.get(`${r.productId}|${r.locationId}`);
        return {
          product: r.product,
          location: r.location,
          qty: r.qty,
          avgCost,
          value: r.qty.mul(avgCost).toDecimalPlaces(0).toNumber(),
          minQty: l?.minQty ?? null,
          maxQty: l?.maxQty ?? null,
          belowMin: l?.minQty != null && r.qty.lt(l.minQty),
        };
      })
      .filter((r) => q.belowMin !== 'true' || r.belowMin);
    return { data };
  });

  /** Kardex de um produto num local (mais recentes primeiro, paginação por cursor). */
  app.get('/stock/products/:id/kardex', view, async (req) => {
    const { id } = idParam.parse(req.params);
    const q = kardexQuery.parse(req.query);
    const db = req.auth.db;
    const location = await db.stockLocation.findUniqueOrThrow({ where: { id: q.locationId } });
    assertUnitAccess(req.auth, location.unitId);
    const rows = await db.stockMovement.findMany({
      where: { productId: id, locationId: q.locationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 0 }),
      include: {
        lot: { select: { code: true, expiryDate: true } },
        user: { select: { name: true } },
        reversedBy: { select: { id: true } },
      },
    });
    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit);
    return { data: { items, nextCursor: hasMore ? rows[q.limit]!.id : null } };
  });

  /** Lotes com saldo num local (FEFO: validade mais próxima primeiro). */
  app.get('/stock/lots', view, async (req) => {
    const { productId, locationId } = req.query as { productId?: string; locationId?: string };
    if (!productId) throw new AppError('VALIDATION_ERROR', 'productId obrigatório');
    const data = await req.auth.db.stockLotBalance.findMany({
      where: { productId, ...(locationId && { locationId }), qty: { not: 0 } },
      include: { lot: true, location: { select: { name: true, unitId: true } } },
      orderBy: [{ lot: { expiryDate: { sort: 'asc', nulls: 'last' } } }, { lot: { code: 'asc' } }],
    });
    return { data: data.filter((d) => canAccessUnit(req.auth, d.location.unitId)) };
  });
  /** Artigos vendidos (linhas das vendas POS confirmadas), por código do POS, no período (dia de negócio). */
  app.get('/stock/sold-items', view, async (req) => {
    const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const q = z
      .object({
        from: day,
        to: day,
        unitId: z.string().min(1).optional(),
        search: z.string().trim().max(100).optional(),
      })
      .parse(req.query);
    if (q.unitId) assertUnitAccess(req.auth, q.unitId);
    const units = q.unitId ? [q.unitId] : req.auth.unitIds === 'all' ? null : req.auth.unitIds;
    const db = req.auth.db;
    const where: Prisma.SalesImportLineWhereInput = {
      saleDate: { gte: new Date(q.from), lte: new Date(q.to) },
      import: { status: 'CONFIRMED', ...(units && { unitId: { in: units } }) },
      ...(q.search && {
        OR: [
          { posCode: { contains: q.search, mode: 'insensitive' } },
          { posLabel: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [groups, labels] = await Promise.all([
      db.salesImportLine.groupBy({
        by: ['posCode'],
        where,
        _sum: { qty: true, amount: true, grossAmount: true },
      }),
      // nome mais recente de cada código
      db.salesImportLine.findMany({
        where,
        distinct: ['posCode'],
        orderBy: [{ posCode: 'asc' }, { saleDate: 'desc' }],
        select: { posCode: true, posLabel: true, saleItem: { select: { name: true } } },
      }),
    ]);
    const label = new Map(labels.map((l) => [l.posCode, l.saleItem?.name ?? l.posLabel ?? '']));
    const rows = groups
      .map((g) => ({
        code: g.posCode,
        name: label.get(g.posCode) ?? '',
        qty: g._sum.qty?.toNumber() ?? 0,
        net: g._sum.amount ?? 0,
        gross: g._sum.grossAmount ?? 0,
      }))
      .filter((r) => r.qty !== 0 || r.gross !== 0)
      .sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name));
    return { data: rows };
  });
}
