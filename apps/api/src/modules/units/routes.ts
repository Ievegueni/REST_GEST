import type { FastifyInstance } from 'fastify';
import { assertUnitAccess, canAccessUnit, protect } from '../../core/auth';
import { assertWithinLimit } from '../../core/limits';
import { idParam } from '../../core/schemas';
import { locationSchema, unitSchema } from './schemas';

export async function unitRoutes(app: FastifyInstance) {
  const manage = protect({ permission: 'units.manage' });

  /** Unidades (com locais) a que o utilizador tem acesso. */
  app.get('/units', protect(), async (req) => {
    const units = await req.auth.db.unit.findMany({
      orderBy: { name: 'asc' },
      include: { locations: { orderBy: { name: 'asc' } } },
    });
    return { data: units.filter((u) => canAccessUnit(req.auth, u.id)) };
  });

  app.post('/units', manage, async (req, reply) => {
    const data = unitSchema.parse(req.body);
    if (data.active) await assertWithinLimit(req.auth.tenantId, 'units');
    return reply.status(201).send({ data: await req.auth.db.unit.create({ data }) });
  });

  app.patch('/units/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    assertUnitAccess(req.auth, id);
    const data = unitSchema.partial().parse(req.body);
    if (data.active) {
      const current = await req.auth.db.unit.findUniqueOrThrow({ where: { id } });
      if (!current.active) await assertWithinLimit(req.auth.tenantId, 'units');
    }
    return { data: await req.auth.db.unit.update({ where: { id }, data }) };
  });

  app.post('/units/:id/locations', manage, async (req, reply) => {
    const { id: unitId } = idParam.parse(req.params);
    assertUnitAccess(req.auth, unitId);
    const data = locationSchema.parse(req.body);
    return reply
      .status(201)
      .send({ data: await req.auth.db.stockLocation.create({ data: { ...data, unitId } }) });
  });

  app.patch('/locations/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const loc = await req.auth.db.stockLocation.findUniqueOrThrow({ where: { id } });
    assertUnitAccess(req.auth, loc.unitId);
    const data = locationSchema.partial().parse(req.body);
    return { data: await req.auth.db.stockLocation.update({ where: { id }, data }) };
  });
}
