import argon2 from 'argon2';
import { audit } from '../../core/audit';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { createTenant } from '../../core/tenants';
import { Prisma } from '@prisma/client';
import { env } from '../../core/env';
import { addDays, todayLocal, zonedMidnight } from '../reports/common';
import type { z } from 'zod';
import type { createTenantSchema, updateTenantSchema } from './schemas';

let dummyHash: Promise<string> | undefined;

export async function login(email: string, password: string) {
  const admin = await prisma.superAdmin.findUnique({ where: { email } });
  const ok = await argon2.verify(
    admin?.passwordHash ?? (await (dummyHash ??= argon2.hash('dummy-password'))),
    password,
  );
  if (!admin || !ok || !admin.active)
    throw new AppError('UNAUTHORIZED', 'Email ou senha incorrectos');
  return admin;
}

export const listTenants = () =>
  prisma.tenant.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { units: true, users: true } } },
  });

export async function getTenant(id: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      _count: { select: { units: true, users: true } },
      users: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          role: { select: { name: true } },
        },
      },
    },
  });
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant não encontrado');
  return { ...tenant, usage: await monthUsage(id) };
}

/** Uso do mês corrente para facturação: SMS enviados, pedidos IA, importações. */
async function monthUsage(tenantId: string) {
  const createdAt = { gte: zonedMidnight(`${todayLocal().slice(0, 8)}01`) };
  const [sms, ai, imports] = await Promise.all([
    prisma.smsLog.aggregate({
      where: { tenantId, status: 'SENT', createdAt },
      _count: true,
      _sum: { cost: true },
    }),
    prisma.aiRequest.aggregate({
      where: { tenantId, createdAt },
      _count: true,
      _sum: { costMicroUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.salesImport.count({ where: { tenantId, createdAt } }),
  ]);
  return {
    smsSent: sms._count,
    smsCost: sms._sum.cost ?? 0,
    aiRequests: ai._count,
    aiTokens: (ai._sum.inputTokens ?? 0) + (ai._sum.outputTokens ?? 0),
    aiCostUsd: (ai._sum.costMicroUsd ?? 0) / 1e6,
    salesImports: imports,
  };
}

export async function create(
  input: z.infer<typeof createTenantSchema>,
  adminId: string,
  ip?: string,
) {
  const { admin, maxUnits, maxUsers, smsMonthlyLimit, aiMonthlyLimit, ...rest } = input;
  const result = await createTenant({
    ...rest,
    limits: { maxUnits, maxUsers, smsMonthlyLimit, aiMonthlyLimit },
    admin,
  });
  await audit({
    tenantId: result.tenant.id,
    userId: adminId,
    action: 'admin.tenant.create',
    entity: 'Tenant',
    entityId: result.tenant.id,
    after: { ...rest, adminEmail: admin.email },
    ip,
  });
  return result.tenant;
}

/** Actualiza tenant (plano, overrides, estado, limites). Regista só os campos alterados. */
export async function update(
  id: string,
  patch: z.infer<typeof updateTenantSchema>,
  adminId: string,
  ip?: string,
) {
  const before = await prisma.tenant.findUnique({ where: { id } });
  if (!before) throw new AppError('NOT_FOUND', 'Tenant não encontrado');
  const after = await prisma.tenant.update({ where: { id }, data: patch });

  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
  if (changed.length) {
    const pick = (t: typeof before) =>
      Object.fromEntries(changed.map((k) => [k, t[k]])) as Prisma.InputJsonObject;
    await audit({
      tenantId: id,
      userId: adminId,
      action: 'admin.tenant.update',
      entity: 'Tenant',
      entityId: id,
      before: pick(before),
      after: pick(after),
      ip,
    });
  }
  return after;
}

/** Escolhe o utilizador a impersonar (por defeito o primeiro Administrador activo) e regista na auditoria. */
export async function impersonationTarget(
  tenantId: string,
  userId: string | undefined,
  adminId: string,
  ip?: string,
) {
  const user = await prisma.user.findFirst({
    where: userId
      ? { id: userId, tenantId, active: true }
      : { tenantId, active: true, role: { name: 'Administrador', isSystem: true } },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) throw new AppError('NOT_FOUND', 'Utilizador não encontrado');
  await audit({
    tenantId,
    userId: adminId,
    action: 'admin.impersonate',
    entity: 'User',
    entityId: user.id,
    ip,
  });
  return user;
}

/** Painel do Super Admin: carteira de tenants, uso do mês e actividade dos últimos 30 dias. */
export async function dashboard() {
  const today = todayLocal();
  const monthStart = zonedMidnight(`${today.slice(0, 8)}01`);
  const from = addDays(today, -29);
  const since = zonedMidnight(from);
  const tz = env.TZ_DISPLAY;
  const perDay = (table: string, extra = Prisma.empty) =>
    prisma.$queryRaw<{ day: string; n: number }[]>`
      SELECT to_char("createdAt" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
      FROM ${Prisma.raw(`"${table}"`)} WHERE "createdAt" >= ${since} ${extra} GROUP BY 1`;

  const [tenants, units, users, sms, ai, imports, aiDays, smsDays, importDays, aiByTenant] =
    await Promise.all([
      prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          plan: true,
          status: true,
          createdAt: true,
          _count: { select: { units: true, users: true } },
        },
      }),
      prisma.unit.count({ where: { active: true } }),
      prisma.user.count({ where: { active: true } }),
      prisma.smsLog.aggregate({
        where: { status: 'SENT', createdAt: { gte: monthStart } },
        _count: true,
        _sum: { cost: true },
      }),
      prisma.aiRequest.aggregate({
        where: { createdAt: { gte: monthStart } },
        _count: true,
        _sum: { costMicroUsd: true },
      }),
      prisma.salesImport.count({ where: { createdAt: { gte: monthStart } } }),
      perDay('AiRequest'),
      perDay('SmsLog', Prisma.sql`AND "status" = 'SENT'`),
      perDay('SalesImport'),
      prisma.aiRequest.groupBy({
        by: ['tenantId'],
        where: { createdAt: { gte: monthStart } },
        _count: true,
        _sum: { costMicroUsd: true },
      }),
    ]);

  const series = (rows: { day: string; n: number }[]) => {
    const m = new Map(rows.map((r) => [r.day, r.n]));
    return Array.from({ length: 30 }, (_, i) => m.get(addDays(from, i)) ?? 0);
  };
  const name = new Map(tenants.map((t) => [t.id, t.name]));
  return {
    tenants: {
      total: tenants.length,
      active: tenants.filter((t) => t.status === 'ACTIVE').length,
      suspended: tenants.filter((t) => t.status === 'SUSPENDED').length,
      completo: tenants.filter((t) => t.plan === 'COMPLETO').length,
      stock: tenants.filter((t) => t.plan === 'STOCK').length,
    },
    units,
    users,
    month: {
      smsSent: sms._count,
      smsCost: sms._sum.cost ?? 0,
      aiRequests: ai._count,
      aiCostUsd: (ai._sum.costMicroUsd ?? 0) / 1e6,
      salesImports: imports,
    },
    daily: {
      days: Array.from({ length: 30 }, (_, i) => addDays(from, i)),
      ai: series(aiDays),
      sms: series(smsDays),
      imports: series(importDays),
    },
    recent: tenants.slice(0, 6),
    topAi: aiByTenant
      .map((r) => ({
        tenantId: r.tenantId,
        name: name.get(r.tenantId) ?? '—',
        requests: r._count,
        costUsd: (r._sum.costMicroUsd ?? 0) / 1e6,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5),
  };
}
