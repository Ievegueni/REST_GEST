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
  await prisma.$executeRaw`DELETE FROM "StockMovement" WHERE "tenantId" = ANY(${ids}) AND "reversalOfId" IS NOT NULL`;
  await prisma.stockMovement.deleteMany({ where });
  await prisma.stockLotBalance.deleteMany({ where });
  await prisma.stockBalance.deleteMany({ where });
  await prisma.stockCost.deleteMany({ where });
  await prisma.lot.deleteMany({ where });
  await prisma.supplierProduct.deleteMany({ where });
  await prisma.productLocationLimit.deleteMany({ where });
  await prisma.productUnitConversion.deleteMany({ where });
  await prisma.product.deleteMany({ where });
  await prisma.supplier.deleteMany({ where });
  await prisma.measureUnit.deleteMany({ where });
  for (let i = 0; i < 5; i++)
    await prisma.category.deleteMany({ where: { ...where, children: { none: {} } } });
  await prisma.userUnit.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.role.deleteMany({ where });
  await prisma.stockLocation.deleteMany({ where });
  await prisma.unit.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
}

/** Cliente HTTP autenticado como `email` (senha de teste por defeito). */
export async function clientFor(app: import('fastify').FastifyInstance, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'password123' },
  });
  const token = res.json().data.accessToken as string;
  return (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}
