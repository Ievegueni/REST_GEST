import { AppError } from './errors';
import { prisma } from './prisma';

/** Bloqueia a criação de unidades/utilizadores acima do limite contratado. */
export async function assertWithinLimit(tenantId: string, kind: 'units' | 'users') {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const max = kind === 'units' ? tenant.maxUnits : tenant.maxUsers;
  if (max == null) return;
  const count =
    kind === 'units'
      ? await prisma.unit.count({ where: { tenantId, active: true } })
      : await prisma.user.count({ where: { tenantId, active: true } });
  if (count >= max) {
    throw new AppError('FORBIDDEN', 'Limite do plano atingido', { kind, max });
  }
}
