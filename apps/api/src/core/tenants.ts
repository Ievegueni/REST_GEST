import argon2 from 'argon2';
import { BASE_ROLES, PERMISSIONS, type Plan } from '@restgest/shared';
import { prisma } from './prisma';

export type TenantLimits = {
  maxUnits?: number | null;
  maxUsers?: number | null;
  smsMonthlyLimit?: number | null;
  aiMonthlyLimit?: number | null;
};

/** Cria tenant + perfis base + primeiro Administrador, numa só transacção. */
export async function createTenant(input: {
  name: string;
  nif?: string | null;
  plan: Plan;
  limits?: TenantLimits;
  admin: { name: string; email: string; password: string; phone?: string | null };
}) {
  const passwordHash = await argon2.hash(input.admin.password);
  // Garante o catálogo global de permissões (novas permissões entram sozinhas).
  await prisma.permission.createMany({
    data: PERMISSIONS.map((code) => ({ code })),
    skipDuplicates: true,
  });
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: input.name, nif: input.nif, plan: input.plan, ...input.limits },
    });
    let adminRoleId = '';
    for (const [name, perms] of Object.entries(BASE_ROLES)) {
      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name,
          isSystem: true,
          permissions: { connect: perms.map((code) => ({ code })) },
        },
      });
      if (name === 'Administrador') adminRoleId = role.id;
    }
    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.admin.email,
        name: input.admin.name,
        phone: input.admin.phone,
        passwordHash,
        roleId: adminRoleId,
        allUnits: true,
      },
    });
    return { tenant, admin };
  });
}
