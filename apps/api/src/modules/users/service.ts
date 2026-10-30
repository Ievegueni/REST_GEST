import argon2 from 'argon2';
import type { z } from 'zod';
import type { AuthContext } from '../../core/auth';
import { audit } from '../../core/audit';
import { AppError } from '../../core/errors';
import { assertWithinLimit } from '../../core/limits';
import type { createUserSchema, updateUserSchema } from './schemas';

const select = {
  id: true,
  email: true,
  name: true,
  phone: true,
  active: true,
  allUnits: true,
  lastLoginAt: true,
  roleId: true,
  role: { select: { name: true } },
  userUnits: { select: { unitId: true } },
} as const;

const shape = <T extends { userUnits: { unitId: string }[] }>({ userUnits, ...u }: T) => ({
  ...u,
  unitIds: userUnits.map((x) => x.unitId),
});

export async function list(auth: AuthContext) {
  const users = await auth.db.user.findMany({ orderBy: { name: 'asc' }, select });
  return users.map(shape);
}

export async function create(
  auth: AuthContext,
  input: z.infer<typeof createUserSchema>,
  ip?: string,
) {
  if (input.active) await assertWithinLimit(auth.tenantId, 'users');
  const { password, unitIds, ...data } = input;
  const passwordHash = await argon2.hash(password);
  const user = await auth.db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { ...data, passwordHash } });
    if (!data.allUnits && unitIds.length) {
      await tx.userUnit.createMany({ data: unitIds.map((unitId) => ({ userId: u.id, unitId })) });
    }
    return tx.user.findUniqueOrThrow({ where: { id: u.id }, select });
  });
  const result = shape(user);
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'user.create',
    entity: 'User',
    entityId: user.id,
    after: { ...data, unitIds },
    ip,
  });
  return result;
}

export async function update(
  auth: AuthContext,
  id: string,
  input: z.infer<typeof updateUserSchema>,
  ip?: string,
) {
  const before = shape(await auth.db.user.findUniqueOrThrow({ where: { id }, select }));
  if (
    id === auth.userId &&
    (input.active === false || (input.roleId && input.roleId !== before.roleId))
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Não pode desactivar nem mudar o perfil do próprio utilizador',
    );
  }
  if (input.active && !before.active) await assertWithinLimit(auth.tenantId, 'users');

  const { password, unitIds, ...data } = input;
  const passwordHash = password ? await argon2.hash(password) : undefined;
  const user = await auth.db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { ...data, ...(passwordHash && { passwordHash }) },
    });
    if (unitIds) {
      await tx.userUnit.deleteMany({ where: { userId: id } });
      if (unitIds.length)
        await tx.userUnit.createMany({ data: unitIds.map((unitId) => ({ userId: id, unitId })) });
    }
    // Senha alterada ou utilizador desactivado: termina as sessões abertas.
    if (passwordHash || input.active === false) {
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return tx.user.findUniqueOrThrow({ where: { id }, select });
  });
  const after = shape(user);
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'user.update',
    entity: 'User',
    entityId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: { ...JSON.parse(JSON.stringify(after)), ...(password && { passwordChanged: true }) },
    ip,
  });
  return after;
}
