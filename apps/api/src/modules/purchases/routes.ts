import type { FastifyInstance } from 'fastify';
import { canAccessUnit, protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import { buildReceiptTemplate, parseReceiptLines } from './receipt-import';
import { listQuery, orderSchema, orderStatusSchema, receiptSchema } from './schemas';
import * as service from './service';

export async function purchaseRoutes(app: FastifyInstance) {
  const manage = protect({ feature: 'purchases', permission: 'purchases.manage' });

  app.get('/purchase-orders', manage, async (req) => {
    const q = listQuery.parse(req.query);
    const rows = await req.auth.db.purchaseOrder.findMany({
      where: {
        ...(q.status && { status: q.status as never }),
        ...(q.supplierId && { supplierId: q.supplierId }),
      },
      orderBy: { number: 'desc' },
      take: 500,
      include: {
        supplier: { select: { name: true } },
        unit: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    });
    return { data: rows.filter((o) => canAccessUnit(req.auth, o.unitId)) };
  });

  app.post('/purchase-orders', manage, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await service.saveOrder(req.auth, null, orderSchema.parse(req.body)) }),
  );

  app.get('/purchase-orders/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await service.getOrder(req.auth, id) };
  });

  app.put('/purchase-orders/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await service.saveOrder(req.auth, id, orderSchema.parse(req.body)) };
  });

  app.post('/purchase-orders/:id/status', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    return {
      data: await service.setOrderStatus(req.auth, id, orderStatusSchema.parse(req.body).status),
    };
  });

  app.get('/goods-receipts', manage, async (req) => {
    const q = listQuery.parse(req.query);
    const rows = await req.auth.db.goodsReceipt.findMany({
      where: {
        ...(q.status && { status: q.status as never }),
        ...(q.supplierId && { supplierId: q.supplierId }),
      },
      orderBy: { number: 'desc' },
      take: 500,
      include: {
        supplier: { select: { name: true } },
        location: { select: { name: true, unitId: true, unit: { select: { name: true } } } },
        order: { select: { number: true } },
      },
    });
    return { data: rows.filter((r) => canAccessUnit(req.auth, r.location.unitId)) };
  });

  app.get('/goods-receipts/import/template', manage, async (_req, reply) =>
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="modelo-recepcao.xlsx"')
      .send(await buildReceiptTemplate()),
  );

  /** Lê um Excel e devolve as linhas para o formulário (não grava). */
  app.post('/goods-receipts/import', manage, async (req) => {
    const file = await req.file();
    if (!file) throw new AppError('VALIDATION_ERROR', 'Ficheiro em falta');
    return { data: await parseReceiptLines(req.auth, await file.toBuffer()) };
  });

  app.post('/goods-receipts', manage, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await service.createReceipt(req.auth, receiptSchema.parse(req.body)) }),
  );

  app.get('/goods-receipts/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await service.getReceipt(req.auth, id) };
  });

  app.post('/goods-receipts/:id/cancel', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await service.cancelReceipt(req.auth, id, req.ip) };
  });
}
