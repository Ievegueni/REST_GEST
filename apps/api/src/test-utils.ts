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
  await prisma.leave.deleteMany({ where });
  await prisma.attendance.deleteMany({ where });
  await prisma.shift.deleteMany({ where });
  await prisma.employeeDocument.deleteMany({ where });
  await prisma.employeeAllowance.deleteMany({ where });
  await prisma.employee.deleteMany({ where });
  await prisma.position.deleteMany({ where });
  await prisma.department.deleteMany({ where });
  await prisma.wasteReason.deleteMany({ where });
  await prisma.smsLog.deleteMany({ where });
  await prisma.notification.deleteMany({ where });
  await prisma.alert.deleteMany({ where });
  await prisma.alertRule.deleteMany({ where });
  await prisma.salesImport.deleteMany({ where });
  await prisma.importProfile.deleteMany({ where });
  await prisma.posItemMapping.deleteMany({ where });
  await prisma.categoryOutputLocation.deleteMany({ where });
  await prisma.recipeLine.deleteMany({ where });
  await prisma.saleItem.deleteMany({ where });
  await prisma.inventoryCount.deleteMany({ where });
  await prisma.transfer.deleteMany({ where });
  await prisma.goodsReceipt.deleteMany({ where });
  await prisma.purchaseOrder.deleteMany({ where });
  await prisma.documentSequence.deleteMany({ where });
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

/** Corpo multipart com um ficheiro (e campos opcionais), para app.inject. */
export function multipart(
  filename: string,
  content: Buffer,
  contentType = 'application/octet-stream',
  fields: Record<string, string> = {},
) {
  const boundary = '----restgest';
  const payload = Buffer.concat([
    // campos antes do ficheiro: o @fastify/multipart só os expõe em file.fields se vierem primeiro
    ...Object.entries(fields).map(([k, v]) =>
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
