import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { protect } from '../core/auth';
import { getSettings, updateSettings } from '../core/settings';

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)')
  .nullable()
  .or(z.literal('').transform(() => null));

const schema = z
  .object({
    negativeStockPolicy: z.enum(['ALLOW', 'BLOCK']),
    smsQuietStart: time,
    smsQuietEnd: time,
    smsDigest: z.boolean(),
    payrollWeeklyHours: z.coerce.number().int().min(1).max(80).nullable(),
    payrollOvertimeRate: z.coerce.number().min(1).max(5).nullable(),
    payrollMonthDays: z.coerce.number().int().min(20).max(31).nullable(),
    cashDifferenceLimit: z.coerce.number().int().min(0).nullable(),
  })
  .partial();

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings', protect(), async (req) => ({ data: await getSettings(req.auth.tenantId) }));
  app.patch('/settings', protect({ permission: 'settings.manage' }), async (req) => ({
    data: await updateSettings(req.auth.tenantId, req.auth.userId, schema.parse(req.body), req.ip),
  }));
}
