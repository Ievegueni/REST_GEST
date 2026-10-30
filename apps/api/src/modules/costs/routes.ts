import type { FastifyInstance } from 'fastify';
import { assertUnitAccess, canAccessUnit, protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import {
  categorySchema,
  dailyCostSchema,
  listQuery,
  paymentMethodSchema,
  recurringSchema,
} from './schemas';
import { generateRecurring } from './service';

export async function costRoutes(app: FastifyInstance) {
  const manage = protect({ feature: 'daily_costs', permission: 'costs.manage' });
  const anyCash = protect(); // meios de pagamento também são usados no fecho de caixa

  // ---- Categorias de custo e meios de pagamento
  app.get('/cost-categories', manage, async (req) => ({
    data: await req.auth.db.costCategory.findMany({ orderBy: { name: 'asc' } }),
  }));
  app.post('/cost-categories', manage, async (req, reply) =>
    reply
      .status(201)
      .send({
        data: await req.auth.db.costCategory.create({ data: categorySchema.parse(req.body) }),
      }),
  );
  app.patch('/cost-categories/:id', manage, async (req) => ({
    data: await req.auth.db.costCategory.update({
      where: { id: idParam.parse(req.params).id },
      data: categorySchema.partial().parse(req.body),
    }),
  }));

  app.get('/payment-methods', anyCash, async (req) => ({
    data: await req.auth.db.paymentMethod.findMany({ orderBy: { name: 'asc' } }),
  }));
  const settings = protect({ permission: 'settings.manage' });
  app.post('/payment-methods', settings, async (req, reply) =>
    reply
      .status(201)
      .send({
        data: await req.auth.db.paymentMethod.create({ data: paymentMethodSchema.parse(req.body) }),
      }),
  );
  app.patch('/payment-methods/:id', settings, async (req) => ({
    data: await req.auth.db.paymentMethod.update({
      where: { id: idParam.parse(req.params).id },
      data: paymentMethodSchema.partial().parse(req.body),
    }),
  }));

  // ---- Custos diários
  app.get('/daily-costs', manage, async (req) => {
    const q = listQuery.parse(req.query);
    if (q.unitId) assertUnitAccess(req.auth, q.unitId);
    const rows = await req.auth.db.dailyCost.findMany({
      where: {
        ...(q.unitId && { unitId: q.unitId }),
        ...(q.categoryId && { categoryId: q.categoryId }),
        ...((q.from || q.to) && {
          date: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) },
        }),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
      include: {
        category: { select: { name: true } },
        paymentMethod: { select: { name: true } },
        unit: { select: { name: true } },
      },
    });
    return { data: rows.filter((r) => canAccessUnit(req.auth, r.unitId)) };
  });
  app.post('/daily-costs', manage, async (req, reply) => {
    const data = dailyCostSchema.parse(req.body);
    assertUnitAccess(req.auth, data.unitId);
    return reply
      .status(201)
      .send({
        data: await req.auth.db.dailyCost.create({
          data: { ...data, createdById: req.auth.userId },
        }),
      });
  });
  app.put('/daily-costs/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const current = await req.auth.db.dailyCost.findUniqueOrThrow({ where: { id } });
    assertUnitAccess(req.auth, current.unitId);
    if (current.cashSessionId)
      throw new AppError('VALIDATION_ERROR', 'Custo pago pela caixa: altere-o no fecho de caixa');
    const data = dailyCostSchema.parse(req.body);
    assertUnitAccess(req.auth, data.unitId);
    return { data: await req.auth.db.dailyCost.update({ where: { id }, data }) };
  });
  app.delete('/daily-costs/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const current = await req.auth.db.dailyCost.findUniqueOrThrow({ where: { id } });
    assertUnitAccess(req.auth, current.unitId);
    if (current.cashSessionId)
      throw new AppError('VALIDATION_ERROR', 'Custo pago pela caixa: altere-o no fecho de caixa');
    await req.auth.db.dailyCost.delete({ where: { id } });
    return { data: { ok: true } };
  });

  // ---- Recorrentes
  app.get('/recurring-costs', manage, async (req) => {
    const rows = await req.auth.db.recurringCost.findMany({
      orderBy: { description: 'asc' },
      include: { category: { select: { name: true } }, unit: { select: { name: true } } },
    });
    return { data: rows.filter((r) => canAccessUnit(req.auth, r.unitId)) };
  });
  app.post('/recurring-costs', manage, async (req, reply) => {
    const data = recurringSchema.parse(req.body);
    assertUnitAccess(req.auth, data.unitId);
    return reply.status(201).send({ data: await req.auth.db.recurringCost.create({ data }) });
  });
  app.put('/recurring-costs/:id', manage, async (req) => {
    const data = recurringSchema.parse(req.body);
    assertUnitAccess(req.auth, data.unitId);
    return {
      data: await req.auth.db.recurringCost.update({
        where: { id: idParam.parse(req.params).id },
        data,
      }),
    };
  });
  /** Gera já os recorrentes em atraso (o job diário faz o mesmo às 06:00). */
  app.post('/recurring-costs/generate', manage, async (req) => ({
    data: { generated: await generateRecurring(req.auth.tenantId) },
  }));
}
