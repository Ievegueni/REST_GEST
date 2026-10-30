import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { protect } from '../core/auth';
import { getSettings, updateSettings } from '../core/settings';

const schema = z.object({ negativeStockPolicy: z.enum(['ALLOW', 'BLOCK']) }).partial();

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings', protect(), async (req) => ({ data: await getSettings(req.auth.tenantId) }));
  app.patch('/settings', protect({ permission: 'settings.manage' }), async (req) => ({
    data: await updateSettings(req.auth.tenantId, req.auth.userId, schema.parse(req.body), req.ip),
  }));
}
