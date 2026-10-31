import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ALERT_TYPES } from '@restgest/shared';
import { canAccessUnit, protect } from '../../core/auth';
import { idParam } from '../../core/schemas';
import { getRules, sweepTenant } from './engine';
import { smsConfigured } from '../../integrations/futurix-sms';

const rulesSchema = z.array(
  z.object({
    type: z.enum(ALERT_TYPES),
    enabled: z.boolean(),
    sms: z.boolean(),
    threshold: z.coerce.number().min(0).max(10_000).nullable(),
    recipientRoleIds: z.array(z.string().min(1)).max(50),
  }),
);

export async function alertRoutes(app: FastifyInstance) {
  const view = protect({ feature: 'alerts_sms' });
  const manage = protect({ feature: 'alerts_sms', permission: 'alerts.manage' });

  // ---- Sino
  app.get('/notifications', view, async (req) => {
    const db = req.auth.db;
    const [items, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: req.auth.userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { alert: { select: { status: true, type: true } } },
      }),
      db.notification.count({ where: { userId: req.auth.userId, readAt: null } }),
    ]);
    return { data: { items, unread } };
  });

  app.post('/notifications/read', view, async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).optional() }).parse(req.body ?? {});
    await req.auth.db.notification.updateMany({
      where: { userId: req.auth.userId, readAt: null, ...(ids && { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
    return { data: { ok: true } };
  });

  // ---- Centro de alertas
  app.get('/alerts', view, async (req) => {
    const q = z
      .object({
        status: z.enum(['OPEN', 'RESOLVED']).default('OPEN'),
        type: z.enum(ALERT_TYPES).optional(),
      })
      .parse(req.query);
    const rows = await req.auth.db.alert.findMany({
      where: { status: q.status, ...(q.type && { type: q.type }) },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { data: rows.filter((a) => !a.unitId || canAccessUnit(req.auth, a.unitId)) };
  });

  /** Fecha manualmente (ex.: rotura conhecida). Volta a abrir se a condição persistir num novo evento. */
  app.post('/alerts/:id/resolve', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    return {
      data: await req.auth.db.alert.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      }),
    };
  });

  app.post('/alerts/sweep', manage, async (req) => {
    await sweepTenant(req.auth.tenantId);
    return { data: { ok: true } };
  });

  // ---- Regras e SMS
  app.get('/alert-rules', manage, async (req) => ({
    data: {
      rules: [...(await getRules(req.auth.db)).values()],
      smsConfigured: await smsConfigured(),
    },
  }));

  app.put('/alert-rules', manage, async (req) => {
    const rules = rulesSchema.parse(req.body);
    const db = req.auth.db;
    await db.$transaction(async (tx) => {
      for (const r of rules) {
        await tx.alertRule.upsert({
          where: { tenantId_type: { tenantId: req.auth.tenantId, type: r.type } },
          create: r,
          update: r,
        });
      }
    });
    return {
      data: { rules: [...(await getRules(db)).values()], smsConfigured: await smsConfigured() },
    };
  });

  app.get('/sms-logs', manage, async (req) => {
    const db = req.auth.db;
    const monthStart = new Date(new Date().toISOString().slice(0, 8) + '01T00:00:00Z');
    const [items, month] = await Promise.all([
      db.smsLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      db.smsLog.groupBy({
        by: ['status'],
        where: { createdAt: { gte: monthStart } },
        _count: { _all: true },
        _sum: { cost: true },
      }),
    ]);
    return { data: { items, month } };
  });
}
