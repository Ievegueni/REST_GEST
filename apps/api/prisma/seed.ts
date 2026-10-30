/** Seed: tenant de demonstração genérico. Dados de clientes reais são criados pelo Super Admin. */
import argon2 from 'argon2';
import { BASE_ROLES, PERMISSIONS } from '@restgest/shared';
import { prisma, tenantDb } from '../src/core/prisma';

const DEMO_NAME = 'Restaurante Demo';
const ADMIN_EMAIL = 'admin@demo.local';

for (const code of PERMISSIONS) {
  await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
}

if (await prisma.tenant.findFirst({ where: { name: DEMO_NAME } })) {
  console.log('Tenant demo já existe — nada a fazer.');
  process.exit(0);
}

const tenant = await prisma.tenant.create({ data: { name: DEMO_NAME, plan: 'STOCK' } });
const db = tenantDb(tenant.id);

for (const [name, perms] of Object.entries(BASE_ROLES)) {
  await db.role.create({
    data: { name, isSystem: true, permissions: { connect: perms.map((code) => ({ code })) } },
  });
}

for (const unitName of ['Unidade Centro', 'Unidade Praia']) {
  const unit = await db.unit.create({ data: { name: unitName } });
  await db.stockLocation.createMany({
    data: [
      { unitId: unit.id, name: 'Armazém', type: 'WAREHOUSE' },
      { unitId: unit.id, name: 'Bar', type: 'BAR' },
      { unitId: unit.id, name: 'Cozinha', type: 'KITCHEN' },
    ],
  });
}

const adminRole = await db.role.findFirstOrThrow({ where: { name: 'Administrador' } });
await db.user.create({
  data: {
    email: ADMIN_EMAIL,
    name: 'Administrador Demo',
    passwordHash: await argon2.hash(process.env.SEED_ADMIN_PASSWORD ?? 'demo1234'),
    roleId: adminRole.id,
    allUnits: true,
  },
});

console.log(`Tenant demo criado. Login: ${ADMIN_EMAIL}`);
await prisma.$disconnect();
