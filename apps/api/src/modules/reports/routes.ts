import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canAccessUnit, protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { env } from '../../core/env';
import { prisma } from '../../core/prisma';
import { addDays, period, filtersSchema, todayLocal, zonedMidnight, type Filters } from './common';
import { REPORTS, type ReportName } from './definitions';
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
        .send(await toPdf(report, subtitle, tenant.name));
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
  app.get('/dashboard', protect({ feature: 'stock', permission: 'stock.view' }), async (req) => {
    const { unitId } = req.query as { unitId?: string };
    const db = req.auth.db;
    const units = unitId ? [unitId] : req.auth.unitIds === 'all' ? undefined : req.auth.unitIds;
    if (unitId && !canAccessUnit(req.auth, unitId))
      throw new AppError('FORBIDDEN', 'Sem acesso a esta unidade');
    const inUnits = units ? { unitId: { in: units } } : {};
    const monthStart = zonedMidnight(`${todayLocal().slice(0, 8)}01`);
    const last30 = period({} as Filters);
    const mv = (types: ('SALE_OUT' | 'CONSUMPTION' | 'WASTE')[], gte: Date) =>
      db.stockMovement.aggregate({
        where: { type: { in: types }, occurredAt: { gte }, location: inUnits },
        _sum: { totalCost: true },
      });

    // série diária (últimos 30 dias, dia local): consumo e quebras ao custo
    const daily = db.$queryRaw<{ day: string; consumption: number; waste: number }[]>`
      SELECT to_char(m."occurredAt" AT TIME ZONE ${env.TZ_DISPLAY}, 'YYYY-MM-DD') AS day,
        COALESCE(-SUM(m."totalCost") FILTER (WHERE m."type"::text IN ('SALE_OUT', 'CONSUMPTION')), 0)::float AS consumption,
        COALESCE(-SUM(m."totalCost") FILTER (WHERE m."type"::text = 'WASTE'), 0)::float AS waste
      FROM "StockMovement" m JOIN "StockLocation" l ON l."id" = m."locationId"
      WHERE m."tenantId" = ${req.auth.tenantId} AND m."occurredAt" >= ${last30.gte}
        ${units ? Prisma.sql`AND l."unitId" IN (${Prisma.join(units)})` : Prisma.empty}
      GROUP BY 1`;

    // vendas da semana (segunda até hoje, dia local) por unidade: importações do POS confirmadas
    const today = todayLocal();
    const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
    const weekly = db.$queryRaw<{ unitId: string; amount: number }[]>`
      SELECT i."unitId", COALESCE(SUM(l."amount"), 0)::int AS amount
      FROM "SalesImportLine" l JOIN "SalesImport" i ON i."id" = l."importId"
      WHERE i."tenantId" = ${req.auth.tenantId} AND i."status"::text = 'CONFIRMED'
        AND l."saleDate" >= ${weekStart}::date AND l."saleDate" <= ${today}::date
        ${units ? Prisma.sql`AND i."unitId" IN (${Prisma.join(units)})` : Prisma.empty}
      GROUP BY 1`;

    const [costs, alerts, openAlerts, consMonth, wasteMonth, purchMonth, top, weekRows, series] =
      await Promise.all([
        db.stockCost.findMany({ where: { ...inUnits, qty: { gt: 0 } } }),
        db.alert.findMany({
          where: {
            status: 'OPEN',
            ...(units && { OR: [{ unitId: null }, { unitId: { in: units } }] }),
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        db.alert.count({
          where: {
            status: 'OPEN',
            ...(units && { OR: [{ unitId: null }, { unitId: { in: units } }] }),
          },
        }),
        mv(['SALE_OUT', 'CONSUMPTION'], monthStart),
        mv(['WASTE'], monthStart),
        db.goodsReceipt.aggregate({
          where: { status: 'POSTED', receivedAt: { gte: monthStart }, location: inUnits },
          _sum: { totalAmount: true },
        }),
        db.stockMovement.groupBy({
          by: ['productId'],
          where: {
            type: { in: ['SALE_OUT', 'CONSUMPTION'] },
            occurredAt: { gte: last30.gte },
            location: inUnits,
          },
          _sum: { totalCost: true },
          orderBy: { _sum: { totalCost: 'asc' } },
          take: 5,
        }),
        weekly,
        daily,
      ]);
    const byDay = new Map(series.map((r) => [r.day, r]));
    const names = new Map(
      (
        await db.product.findMany({
          where: { id: { in: top.map((t) => t.productId) } },
          select: { id: true, name: true },
        })
      ).map((p) => [p.id, p.name]),
    );
    return {
      data: {
        stockValue: Math.round(costs.reduce((s, c) => s + c.qty.mul(c.avgCost).toNumber(), 0)),
        openAlerts,
        alerts,
        consumptionMonth: -(consMonth._sum.totalCost ?? 0),
        wasteMonth: -(wasteMonth._sum.totalCost ?? 0),
        purchasesMonth: purchMonth._sum.totalAmount ?? 0,
        daily: Array.from({ length: last30.days }, (_, i) => {
          const d = addDays(last30.from, i);
          const r = byDay.get(d);
          return {
            date: d,
            consumption: Math.round(r?.consumption ?? 0),
            waste: Math.round(r?.waste ?? 0),
          };
        }),
        topConsumption: top.map((t) => ({
          productId: t.productId,
          name: names.get(t.productId) ?? '',
          value: -(t._sum.totalCost ?? 0),
        })),
        weekSales: {
          from: weekStart,
          to: today,
          units: (
            await db.unit.findMany({
              where: { active: true, ...(units && { id: { in: units } }) },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          ).map((u) => ({
            unitId: u.id,
            name: u.name,
            amount: weekRows.find((r) => r.unitId === u.id)?.amount ?? 0,
          })),
        },
      },
    };
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
