import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { protect } from '../../core/auth';
import { period, scopeUnits } from '../reports/common';
import { summary } from './service';

export async function financialRoutes(app: FastifyInstance) {
  const view = protect({ feature: 'financial_results', permission: 'financial.view' });
  app.get('/financial/summary', view, async (req) => {
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        unitId: z.string().optional(),
      })
      .parse(req.query);
    const f = { ...q, a: 80, b: 95 };
    const p = period(f);
    return { data: await summary(req.auth, p.from, p.to, scopeUnits(req.auth, f)) };
  });
}
