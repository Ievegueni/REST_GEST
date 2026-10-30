/** Seed de desenvolvimento: tenant de demonstração genérico + Super Admin de dev. */
import argon2 from 'argon2';
import { prisma, tenantDb } from '../src/core/prisma';
import { createTenant } from '../src/core/tenants';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'demo1234';

await prisma.superAdmin.upsert({
  where: { email: 'admin@comunica.local' },
  update: {},
  create: {
    email: 'admin@comunica.local',
    name: 'Super Admin (dev)',
    passwordHash: await argon2.hash(PASSWORD),
  },
});

if (!(await prisma.tenant.findFirst({ where: { name: 'Restaurante Demo' } }))) {
  const { tenant } = await createTenant({
    name: 'Restaurante Demo',
    plan: 'STOCK',
    admin: { name: 'Administrador Demo', email: 'admin@demo.local', password: PASSWORD },
  });
  const db = tenantDb(tenant.id);
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
}

console.log('Seed ok. Tenant: admin@demo.local · Super Admin: admin@comunica.local');
await prisma.$disconnect();
