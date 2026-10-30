import type { FastifyInstance } from 'fastify';
import { canAccessUnit, protect } from '../../core/auth';
import { idParam } from '../../core/schemas';
import { receiveSchema, transferSchema } from './schemas';
import * as service from './service';

export async function transferRoutes(app: FastifyInstance) {
  const manage = protect({ feature: 'stock', permission: 'transfers.manage' });

  app.get('/transfers', manage, async (req) => {
    const { status } = req.query as { status?: string };
    const rows = await req.auth.db.transfer.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { number: 'desc' },
      take: 500,
      include: {
        fromLocation: { select: { name: true, unitId: true, unit: { select: { name: true } } } },
        toLocation: { select: { name: true, unitId: true, unit: { select: { name: true } } } },
        _count: { select: { lines: true } },
      },
    });
    return {
      data: rows.filter(
        (t) =>
          canAccessUnit(req.auth, t.fromLocation.unitId) ||
          canAccessUnit(req.auth, t.toLocation.unitId),
      ),
    };
  });

  app.post('/transfers', manage, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await service.createTransfer(req.auth, transferSchema.parse(req.body)) }),
  );

  app.get('/transfers/:id', manage, async (req) => ({
    data: await service.getTransfer(req.auth, idParam.parse(req.params).id),
  }));

  app.post('/transfers/:id/send', manage, async (req) => ({
    data: await service.sendTransfer(req.auth, idParam.parse(req.params).id),
  }));

  app.post('/transfers/:id/receive', manage, async (req) => ({
    data: await service.receiveTransfer(
      req.auth,
      idParam.parse(req.params).id,
      receiveSchema.parse(req.body),
    ),
  }));

  app.post('/transfers/:id/cancel', manage, async (req) => ({
    data: await service.cancelTransfer(req.auth, idParam.parse(req.params).id),
  }));
}
