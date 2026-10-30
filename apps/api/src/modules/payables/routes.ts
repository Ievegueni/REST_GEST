import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canAccessUnit, protect } from '../../core/auth';
import { idParam } from '../../core/schemas';
import * as service from './service';

export async function payableRoutes(app: FastifyInstance) {
  const manage = protect({ feature: 'payables', permission: 'payables.manage' });

  app.get('/payables', manage, async (req) => {
    const q = z
      .object({
        status: z.string().optional(),
        supplierId: z.string().optional(),
        unitId: z.string().optional(),
        open: z.enum(['true']).optional(),
      })
      .parse(req.query);
    const rows = await req.auth.db.payable.findMany({
      where: {
        ...(q.status && { status: q.status as never }),
        ...(q.open && { status: { in: ['OPEN', 'PARTIAL'] } }),
        ...(q.supplierId && { supplierId: q.supplierId }),
        ...(q.unitId && { unitId: q.unitId }),
      },
      orderBy: [{ dueDate: 'asc' }],
      take: 1000,
      include: {
        supplier: { select: { name: true } },
        unit: { select: { name: true } },
        receipt: { select: { number: true } },
      },
    });
    return { data: rows.filter((r) => canAccessUnit(req.auth, r.unitId)) };
  });
  app.post('/payables', manage, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await service.createManual(req.auth, service.payableSchema.parse(req.body)) }),
  );
  app.get('/payables/:id', manage, async (req) => ({
    data: await service.getPayable(req.auth, idParam.parse(req.params).id),
  }));
  app.post('/payables/:id/cancel', manage, async (req) => ({
    data: await service.cancelManual(req.auth, idParam.parse(req.params).id),
  }));
  app.post('/payables/:id/payments', manage, async (req, reply) =>
    reply.status(201).send({
      data: await service.addPayment(
        req.auth,
        idParam.parse(req.params).id,
        service.paymentSchema.parse(req.body),
        req.ip,
      ),
    }),
  );
  app.delete<{ Params: { id: string; paymentId: string } }>(
    '/payables/:id/payments/:paymentId',
    manage,
    async (req) => ({
      data: await service.deletePayment(req.auth, req.params.id, req.params.paymentId, req.ip),
    }),
  );
}
