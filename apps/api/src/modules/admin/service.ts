import argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { audit } from '../../core/audit';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { createTenant } from '../../core/tenants';
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
  return tenant;
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
