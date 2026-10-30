import argon2 from 'argon2';
import type { Plan } from '@restgest/shared';
import { prisma, tenantDb } from './core/prisma';

/** Cria tenant + perfil + utilizador (com acesso a todas as unidades) para testes. */
export async function createTestTenant(opts: {
  name: string;
  plan?: Plan;
  perms?: string[];
  password?: string;
}) {
  for (const code of opts.perms ?? []) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const tenant = await prisma.tenant.create({
    data: { name: opts.name, plan: opts.plan ?? 'STOCK' },
  });
  const db = tenantDb(tenant.id);
  const role = await db.role.create({
    data: { name: 'Teste', permissions: { connect: (opts.perms ?? []).map((code) => ({ code })) } },
  });
  const unit = await db.unit.create({ data: { name: `${opts.name} unidade` } });
  const email = `${opts.name.toLowerCase()}-${tenant.id}@test.local`;
  const user = await db.user.create({
    data: {
      email,
      name: opts.name,
      roleId: role.id,
      allUnits: true,
      passwordHash: await argon2.hash(opts.password ?? 'password123'),
    },
  });
  return { tenant, role, unit, user, email };
}

export async function deleteTenants(ids: string[]) {
  const where = { tenantId: { in: ids } };
  await prisma.auditLog.deleteMany({ where });
  await prisma.refreshToken.deleteMany({ where });
  await prisma.passwordReset.deleteMany({ where });
  await prisma.userUnit.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.role.deleteMany({ where });
  await prisma.stockLocation.deleteMany({ where });
  await prisma.unit.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
}
