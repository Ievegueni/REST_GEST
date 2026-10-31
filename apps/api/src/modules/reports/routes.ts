import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { env } from '../../core/env';
import { prisma } from '../../core/prisma';
import { filtersSchema, period, scopeUnits, todayLocal, type Filters } from './common';
import { REPORTS, type ReportName } from './definitions';
import { logoDataUrl } from '../../core/logo';
import { ownerDashboard } from './dashboard';
import { toPdf, toXlsx } from './export';
import { createOrders, suggest } from './replenishment';

export async function reportRoutes(app: FastifyInstance) {
  const reports = protect({ feature: 'reports_stock', permission: 'reports.view' });

  /** Relatórios disponíveis no plano do tenant. */
  const allowed = (req: { auth: { features: Set<string> } }, r: (typeof REPORTS)[ReportName]) =>
    !('feature' in r) || req.auth.features.has(r.feature);

  app.get('/reports', reports, async (req) => ({
    data: Object.entries(REPORTS)
      .filter(([, r]) => allowed(req, r))
      .map(([name, r]) => ({ name, title: r.title, period: r.period })),
  }));

  app.get<{ Params: { name: string } }>('/reports/:name', reports, async (req, reply) => {
    const def = REPORTS[req.params.name as ReportName];
    if (!def) throw new AppError('NOT_FOUND', 'Relatório desconhecido');
    if (!allowed(req, def))
      throw new AppError('FEATURE_NOT_IN_PLAN', 'Funcionalidade não incluída no plano');
    const { format = 'json', ...rest } = req.query as Record<string, string>;
    const f = filtersSchema.parse(rest);
    const report = await def.run(req.auth, f);
    if (format === 'json') return { data: report };

    const subtitle = await describeFilters(req.auth.db, f, def.period);
    const file = `${req.params.name}-${todayLocal()}`;
    if (format === 'xlsx') {
      return reply
        .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('content-disposition', `attachment; filename="${file}.xlsx"`)
        .send(await toXlsx(report, subtitle));
    }
    if (format === 'pdf') {
      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: req.auth.tenantId },
        select: { name: true },
      });
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${file}.pdf"`)
        .send(await toPdf(report, subtitle, tenant.name, await logoDataUrl(req.auth.tenantId)));
    }
    throw new AppError('VALIDATION_ERROR', 'Formato inválido (json, xlsx, pdf)');
  });

  // ---- Sugestão de reposição
  const purchases = protect({ feature: 'purchases', permission: 'purchases.manage' });
  app.get('/replenishment', purchases, async (req) => {
    const q = z
      .object({
        unitId: z.string().min(1),
        coverageDays: z.coerce.number().int().min(1).max(90).default(7),
        lookbackDays: z.coerce.number().int().min(7).max(180).default(28),
      })
      .parse(req.query);
    return { data: await suggest(req.auth, q) };
  });
  app.post('/replenishment/orders', purchases, async (req) => {
    const body = z
      .object({
        unitId: z.string().min(1),
        lines: z
          .array(
            z.object({
              productId: z.string().min(1),
              unitId: z.string().min(1),
              qty: z.coerce.number().positive(),
              supplierId: z.string().min(1),
              unitPrice: z.coerce.number().int().min(0).nullable(),
            }),
          )
          .min(1),
      })
      .parse(req.body);
    return { data: await createOrders(req.auth, body) };
  });

  // ---- Dashboard
  /** Painel do dono: período (por defeito o mês corrente), por unidade e consolidado. */
  app.get('/dashboard', protect({ feature: 'stock', permission: 'stock.view' }), async (req) => {
    const q = z
      .object({
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        unitId: z.string().optional(),
      })
      .parse(req.query);
    const today = todayLocal();
    const f = filtersSchema.parse({
      from: q.from ?? `${today.slice(0, 8)}01`,
      to: q.to ?? today,
      unitId: q.unitId,
    });
    if (f.from! > f.to!) throw new AppError('VALIDATION_ERROR', 'Data inicial depois da final');
    return { data: await ownerDashboard(req.auth, f, scopeUnits(req.auth, f)) };
  });
}

async function describeFilters(
  db: import('../../core/prisma').TenantDb,
  f: Filters,
  withPeriod: boolean,
) {
  const parts: string[] = [];
  if (withPeriod) {
    const p = period(f);
    const fmt = (d: string) => d.split('-').reverse().join('/');
    parts.push(`Período: ${fmt(p.from)} – ${fmt(p.to)}`);
  }
  if (f.unitId)
    parts.push(`Unidade: ${(await db.unit.findUnique({ where: { id: f.unitId } }))?.name ?? ''}`);
  if (f.locationId)
    parts.push(
      `Local: ${(await db.stockLocation.findUnique({ where: { id: f.locationId } }))?.name ?? ''}`,
    );
  if (f.categoryId)
    parts.push(
      `Categoria: ${(await db.category.findUnique({ where: { id: f.categoryId } }))?.name ?? ''}`,
    );
  parts.push(`Gerado em ${new Date().toLocaleString('pt-AO', { timeZone: env.TZ_DISPLAY })}`);
  return parts.join(' · ');
}
