import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, tenantDb } from './prisma';

let a: string, b: string, unitB: string;

beforeAll(async () => {
  a = (await prisma.tenant.create({ data: { name: 'iso-A' } })).id;
  b = (await prisma.tenant.create({ data: { name: 'iso-B' } })).id;
  await tenantDb(a).unit.create({ data: { name: 'U-A' } });
  unitB = (await tenantDb(b).unit.create({ data: { name: 'U-B' } })).id;
});

afterAll(async () => {
  await prisma.unit.deleteMany({ where: { tenantId: { in: [a, b] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [a, b] } } });
  await prisma.$disconnect();
});

describe('isolamento de tenant', () => {
  it('create injecta tenantId', async () => {
    const units = await prisma.unit.findMany({ where: { tenantId: a } });
    expect(units.map((u) => u.name)).toEqual(['U-A']);
  });

  it('findMany só devolve dados do próprio tenant', async () => {
    const units = await tenantDb(a).unit.findMany();
    expect(units.every((u) => u.tenantId === a)).toBe(true);
    expect(units).toHaveLength(1);
  });

  it('findUnique por id de outro tenant devolve null', async () => {
    expect(await tenantDb(a).unit.findUnique({ where: { id: unitB } })).toBeNull();
  });

  it('não actualiza nem apaga dados de outro tenant', async () => {
    await expect(
      tenantDb(a).unit.update({ where: { id: unitB }, data: { name: 'hack' } }),
    ).rejects.toThrow();
    expect((await tenantDb(a).unit.deleteMany({ where: { id: unitB } })).count).toBe(0);
    expect((await tenantDb(b).unit.findUnique({ where: { id: unitB } }))?.name).toBe('U-B');
  });

  it('rejeita tenantId definido manualmente', async () => {
    await expect(
      tenantDb(a).unit.create({ data: { name: 'x', tenantId: b } as never }),
    ).rejects.toThrow('tenantId');
  });

  it('client cru sem tenant falha na escrita', async () => {
    await expect(prisma.unit.create({ data: { name: 'sem-tenant' } })).rejects.toThrow();
  });
});
