import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agentRoute, agentUnitId, assertUnitAccess, protect } from '../../core/auth';
import { getSettings } from '../../core/settings';
import { idParam } from '../../core/schemas';
import { kitchenSnapshotSchema, syncKitchen, zoneIgnored } from './service';

const RECENT_MS = 30 * 60_000; // prontos recentes que ainda se podem recuperar

export async function kitchenRoutes(app: FastifyInstance) {
  const manage = protect({ feature: 'kitchen_display', permission: 'kitchen.manage' });

  /** Ecrã: talões abertos da zona (mais antigos primeiro) + últimos prontos (para recuperar). */
  app.get('/kitchen/tickets', manage, async (req) => {
    const q = z.object({ unitId: z.string().min(1), zone: z.string().optional() }).parse(req.query);
    assertUnitAccess(req.auth, q.unitId);
    const db = req.auth.db;
    const zoneWhere = q.zone ? { zone: q.zone } : {};
    const include = { items: { orderBy: { position: 'asc' as const } } };
    const [tickets, ready, zones, settings] = await Promise.all([
      db.kitchenTicket.findMany({
        where: { unitId: q.unitId, closedAt: null, status: { not: 'READY' }, ...zoneWhere },
        // empate (ex.: primeira sincronização): a ronda do POS é crescente
        orderBy: [{ seenAt: 'asc' }, { round: 'asc' }],
        include,
      }),
      db.kitchenTicket.findMany({
        where: {
          unitId: q.unitId,
          status: 'READY',
          readyAt: { gte: new Date(Date.now() - RECENT_MS) },
          ...zoneWhere,
        },
        orderBy: { readyAt: 'desc' },
        take: 5,
        include,
      }),
      db.kitchenTicket.groupBy({ by: ['zone'], where: { unitId: q.unitId } }),
      getSettings(req.auth.tenantId),
    ]);
    return {
      data: {
        now: new Date(),
        tickets,
        ready,
        zones: zones
          .map((z) => z.zone)
          .filter((z) => !zoneIgnored(z))
          .sort(),
        warnMinutes: settings.kdsWarnMinutes,
        lateMinutes: settings.kdsLateMinutes,
      },
    };
  });

  /** Novo → Em produção → Pronto (e recuperar: Pronto → Em produção). */
  app.post('/kitchen/tickets/:id/status', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const { status } = z
      .object({ status: z.enum(['NEW', 'IN_PROGRESS', 'READY']) })
      .parse(req.body);
    const db = req.auth.db;
    const t = await db.kitchenTicket.findUniqueOrThrow({ where: { id } });
    assertUnitAccess(req.auth, t.unitId);
    const now = new Date();
    return {
      data: await db.kitchenTicket.update({
        where: { id },
        data: {
          status,
          startedAt: status === 'NEW' ? null : (t.startedAt ?? now),
          readyAt: status === 'READY' ? now : null,
        },
      }),
    };
  });

  app.post(
    '/pos-agent/kitchen',
    { ...agentRoute('kitchen_display'), bodyLimit: 5 * 1024 * 1024 },
    async (req) => ({
      data: await syncKitchen(
        req.auth,
        agentUnitId(req.auth),
        kitchenSnapshotSchema.parse(req.body).lines,
      ),
    }),
  );
}
