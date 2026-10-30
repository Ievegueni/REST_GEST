import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { assertUnitAccess, canAccessUnit, protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import { amountsSchema, closeSchema, movementSchema, openSchema } from './schemas';
import * as service from './service';

/** Ver o caixa: quem fecha ou quem valida. */
async function canView(req: FastifyRequest) {
  if (!req.auth.permissions.has('cash.close') && !req.auth.permissions.has('cash.validate')) {
    throw new AppError('FORBIDDEN', 'Sem permissão para esta operação', {
      permission: 'cash.close',
    });
  }
}

export async function cashRoutes(app: FastifyInstance) {
  const feature = protect({ feature: 'cash_closing' });
  const view = { preHandler: [...feature.preHandler, canView] };
  const close = protect({ feature: 'cash_closing', permission: 'cash.close' });
  const validate = protect({ feature: 'cash_closing', permission: 'cash.validate' });

  app.get('/cash-sessions', view, async (req) => {
    const q = z
      .object({ unitId: z.string().optional(), status: z.string().optional() })
      .parse(req.query);
    if (q.unitId) assertUnitAccess(req.auth, q.unitId);
    const rows = await req.auth.db.cashSession.findMany({
      where: {
        ...(q.unitId && { unitId: q.unitId }),
        ...(q.status && { status: q.status as never }),
      },
      orderBy: [{ businessDate: 'desc' }, { shift: 'asc' }],
      take: 300,
      include: { unit: { select: { name: true } } },
    });
    return { data: rows.filter((r) => canAccessUnit(req.auth, r.unitId)) };
  });
  app.post('/cash-sessions', close, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await service.openSession(req.auth, openSchema.parse(req.body)) }),
  );
  app.get('/cash-sessions/:id', view, async (req) => ({
    data: await service.getSession(req.auth, idParam.parse(req.params).id),
  }));
  app.put('/cash-sessions/:id/amounts', close, async (req) => ({
    data: await service.setAmounts(
      req.auth,
      idParam.parse(req.params).id,
      amountsSchema.parse(req.body),
    ),
  }));
  app.post('/cash-sessions/:id/movements', close, async (req, reply) =>
    reply.status(201).send({
      data: await service.addMovement(
        req.auth,
        idParam.parse(req.params).id,
        movementSchema.parse(req.body),
      ),
    }),
  );
  app.delete<{ Params: { id: string; movementId: string } }>(
    '/cash-sessions/:id/movements/:movementId',
    close,
    async (req) => ({
      data: await service.deleteMovement(req.auth, req.params.id, req.params.movementId),
    }),
  );
  app.post('/cash-sessions/:id/close', close, async (req) => ({
    data: await service.closeSession(
      req.auth,
      idParam.parse(req.params).id,
      closeSchema.parse(req.body ?? {}).justification,
      req.ip,
    ),
  }));
  app.post('/cash-sessions/:id/reopen', validate, async (req) => ({
    data: await service.reopenSession(req.auth, idParam.parse(req.params).id, req.ip),
  }));
  app.post('/cash-sessions/:id/validate', validate, async (req) => ({
    data: await service.validateSession(req.auth, idParam.parse(req.params).id, req.ip),
  }));
}
