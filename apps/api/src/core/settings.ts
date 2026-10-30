import type { NegativeStockPolicy } from '@prisma/client';
import { audit } from './audit';
import { prisma } from './prisma';

/** Definições operacionais do tenant (a linha Tenant está fora de tenantDb). */
export const getSettings = (tenantId: string) =>
  prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true, nif: true, negativeStockPolicy: true },
  });

export async function updateSettings(
  tenantId: string,
  userId: string,
  data: { negativeStockPolicy?: NegativeStockPolicy },
  ip?: string,
) {
  const before = await getSettings(tenantId);
  const after = await prisma.tenant.update({
    where: { id: tenantId },
    data,
    select: { name: true, nif: true, negativeStockPolicy: true },
  });
  await audit({
    tenantId,
    userId,
    action: 'settings.update',
    entity: 'Tenant',
    entityId: tenantId,
    before,
    after,
    ip,
  });
  return after;
}
