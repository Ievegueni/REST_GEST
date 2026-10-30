import type { FastifyInstance } from 'fastify';
import { canAccessUnit, protect } from '../../core/auth';
import { idParam } from '../../core/schemas';
import { countSchema, openSchema } from './schemas';
import * as service from './service';

export async function inventoryRoutes(app: FastifyInstance) {
  const count = protect({ feature: 'stock', permission: 'inventory.count' });
  const close = protect({ feature: 'stock', permission: 'inventory.close' });

  app.get('/inventory-counts', count, async (req) => {
    const rows = await req.auth.db.inventoryCount.findMany({
      orderBy: { number: 'desc' },
      take: 200,
      include: {
        location: { select: { name: true, unitId: true, unit: { select: { name: true } } } },
        category: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    });
    return { data: rows.filter((c) => canAccessUnit(req.auth, c.location.unitId)) };
  });

  app.post('/inventory-counts', close, async (req, reply) =>
    reply.status(201).send({ data: await service.openCount(req.auth, openSchema.parse(req.body)) }),
  );

  app.get('/inventory-counts/:id', count, async (req) => ({
    data: await service.getCount(req.auth, idParam.parse(req.params).id),
  }));

  app.put('/inventory-counts/:id/lines', count, async (req) => ({
    data: await service.saveCounts(
      req.auth,
      idParam.parse(req.params).id,
      countSchema.parse(req.body),
    ),
  }));

  app.post('/inventory-counts/:id/close', close, async (req) => ({
    data: await service.closeCount(req.auth, idParam.parse(req.params).id, req.ip),
  }));

  app.post('/inventory-counts/:id/cancel', close, async (req) => ({
    data: await service.cancelCount(req.auth, idParam.parse(req.params).id),
  }));
}
