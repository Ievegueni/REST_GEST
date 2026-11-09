import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../../core/audit';
import { assertUnitAccess, authenticateAgent, protect, type AuthContext } from '../../core/auth';
import { sha256 } from '../../core/crypto';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import { addDays, todayLocal, zonedMidnight } from '../reports/common';
import {
  boardQuery,
  reservationPatch,
  reservationSchema,
  tableRangeSchema,
  tableSchema,
} from './schemas';
import { syncPosTables } from './service';

/**
 * Mesa válida para sentar: activa, da unidade e livre.
 * ponytail: verificação sem lock; dois tablets a sentar na mesma mesa no mesmo instante passam ambos.
 */
async function assertTable(
  auth: AuthContext,
  unitId: string,
  tableId: string,
  seating: boolean,
  reservationId = '',
) {
  const table = await auth.db.diningTable.findFirst({
    where: { id: tableId, unitId, active: true },
  });
  if (!table) throw new AppError('VALIDATION_ERROR', 'Mesa inválida para esta unidade');
  if (!seating) return;
  const busy = await auth.db.reservation.count({
    where: { tableId, status: 'SEATED', id: { not: reservationId } },
  });
  if (busy) throw new AppError('CONFLICT', `A mesa ${table.name} está ocupada`);
}

export async function reservationRoutes(app: FastifyInstance) {
  const manage = protect({ feature: 'reservations', permission: 'reservations.manage' });

  // ---- Mesas
  app.get('/tables', manage, async (req) => {
    const { unitId } = boardQuery.parse(req.query);
    assertUnitAccess(req.auth, unitId);
    return {
      data: await req.auth.db.diningTable.findMany({
        where: { unitId },
        orderBy: [{ area: 'asc' }, { name: 'asc' }],
      }),
    };
  });
  app.post('/tables', manage, async (req, reply) => {
    const data = tableSchema.parse(req.body);
    assertUnitAccess(req.auth, data.unitId);
    return reply.status(201).send({ data: await req.auth.db.diningTable.create({ data }) });
  });
  /** Cria as mesas from..to (nome = número); as que já existem ficam como estão. */
  app.post('/tables/range', manage, async (req, reply) => {
    const { from, to, ...rest } = tableRangeSchema.parse(req.body);
    assertUnitAccess(req.auth, rest.unitId);
    const { count } = await req.auth.db.diningTable.createMany({
      data: Array.from({ length: to - from + 1 }, (_, i) => ({ ...rest, name: String(from + i) })),
      skipDuplicates: true,
    });
    return reply.status(201).send({ data: { created: count } });
  });
  app.patch('/tables/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const current = await req.auth.db.diningTable.findUniqueOrThrow({ where: { id } });
    assertUnitAccess(req.auth, current.unitId);
    const data = tableSchema.omit({ unitId: true }).partial().parse(req.body);
    return { data: await req.auth.db.diningTable.update({ where: { id }, data }) };
  });

  // ---- Ecrã da recepção: mesas + reservas do dia + mesas ocupadas (de qualquer dia)
  app.get('/reservations/board', manage, async (req) => {
    const { unitId, date = todayLocal() } = boardQuery.parse(req.query);
    assertUnitAccess(req.auth, unitId);
    const [tables, reservations] = await Promise.all([
      req.auth.db.diningTable.findMany({
        where: { unitId, active: true },
        orderBy: [{ area: 'asc' }, { name: 'asc' }],
      }),
      req.auth.db.reservation.findMany({
        where: {
          unitId,
          OR: [
            { startsAt: { gte: zonedMidnight(date), lt: zonedMidnight(addDays(date, 1)) } },
            { status: 'SEATED' },
          ],
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return { data: { date, tables, reservations } };
  });

  app.post('/reservations', manage, async (req, reply) => {
    const { walkIn, ...data } = reservationSchema.parse(req.body);
    assertUnitAccess(req.auth, data.unitId);
    if (walkIn && !data.tableId) throw new AppError('VALIDATION_ERROR', 'Escolha a mesa');
    if (data.tableId) await assertTable(req.auth, data.unitId, data.tableId, walkIn);
    const now = new Date();
    return reply.status(201).send({
      data: await req.auth.db.reservation.create({
        data: {
          ...data,
          walkIn,
          createdById: req.auth.userId,
          ...(walkIn && { status: 'SEATED', seatedAt: now, startsAt: now }),
        },
      }),
    });
  });

  /** Editar, sentar (status SEATED + mesa), libertar (DONE), cancelar, não compareceu. */
  app.patch('/reservations/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const current = await req.auth.db.reservation.findUniqueOrThrow({ where: { id } });
    assertUnitAccess(req.auth, current.unitId);
    const data = reservationPatch.parse(req.body);
    const status = data.status ?? current.status;
    const tableId = data.tableId === undefined ? current.tableId : data.tableId;
    if (status === 'SEATED' && !tableId) throw new AppError('VALIDATION_ERROR', 'Escolha a mesa');
    const seating = status === 'SEATED' && current.status !== 'SEATED';
    if (tableId && (tableId !== current.tableId || seating))
      await assertTable(req.auth, current.unitId, tableId, status === 'SEATED', id);
    const now = new Date();
    return {
      data: await req.auth.db.reservation.update({
        where: { id },
        data: {
          ...data,
          ...(seating && { seatedAt: now, closedAt: null }),
          ...(status === 'DONE' && current.status !== 'DONE' && { closedAt: now }),
        },
      }),
    };
  });

  // ---- Agente POS local (lê as mesas abertas na BD do POS e envia a lista)
  /** Gera (ou substitui) a chave do agente da unidade. A chave só é devolvida agora. */
  app.post(
    '/units/:id/pos-agent-key',
    protect({ feature: 'reservations', permission: 'units.manage' }),
    async (req) => {
      const { id } = idParam.parse(req.params);
      assertUnitAccess(req.auth, id);
      const key = `rga_${randomBytes(24).toString('base64url')}`;
      await req.auth.db.unit.update({ where: { id }, data: { posAgentKeyHash: sha256(key) } });
      await audit({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        action: 'pos_agent_key.generate',
        entity: 'Unit',
        entityId: id,
      });
      return { data: { key } };
    },
  );

  app.post('/pos-agent/tables', { preHandler: authenticateAgent }, async (req) => {
    const { open } = z.object({ open: z.array(z.string().max(50)).max(1000) }).parse(req.body);
    const [unitId] = req.auth.unitIds as string[];
    return { data: await syncPosTables(req.auth, unitId!, open) };
  });
}
