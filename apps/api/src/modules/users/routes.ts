import type { FastifyInstance } from 'fastify';
import { protect } from '../../core/auth';
import { idParam } from '../../core/schemas';
import { createUserSchema, updateUserSchema } from './schemas';
import * as service from './service';

export async function userRoutes(app: FastifyInstance) {
  const manage = protect({ permission: 'users.manage' });

  app.get('/roles', manage, async (req) => ({
    data: await req.auth.db.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { select: { code: true } } },
    }),
  }));

  app.get('/users', manage, async (req) => ({ data: await service.list(req.auth) }));

  app.post('/users', manage, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await service.create(req.auth, createUserSchema.parse(req.body), req.ip) }),
  );

  app.patch('/users/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await service.update(req.auth, id, updateUserSchema.parse(req.body), req.ip) };
  });
}
