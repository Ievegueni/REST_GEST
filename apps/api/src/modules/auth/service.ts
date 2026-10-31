import { logoUrl } from '../../core/logo';
import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { audit } from '../../core/audit';

export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const RESET_TTL_MS = 3600 * 1000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

// Hash fixo para igualar o tempo de resposta quando o email não existe.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash('dummy-password'));

const invalid = () => new AppError('UNAUTHORIZED', 'Email ou senha incorrectos');

export async function login(email: string, password: string, ip?: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  const ok = await argon2.verify(user?.passwordHash ?? (await getDummyHash()), password);
  if (!user || !ok || !user.active) throw invalid();
  if (user.tenant.status !== 'ACTIVE') throw new AppError('FORBIDDEN', 'Conta suspensa');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'auth.login',
    entity: 'User',
    entityId: user.id,
    ip,
  });
  return { user, refreshToken: await createRefreshToken(user.id, user.tenantId) };
}

async function createRefreshToken(userId: string, tenantId: string) {
  const token = newToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tenantId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return token;
}

const REUSE_GRACE_MS = 30_000;

/**
 * Roda o refresh token. Reutilização de um token já revogado = roubo → revoga todos do utilizador.
 * Margem de 30 s para pedidos concorrentes legítimos (várias abas a arrancar ao mesmo tempo).
 */
export async function rotateRefreshToken(token: string) {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { tenant: true } } },
  });
  if (!row) throw new AppError('UNAUTHORIZED', 'Sessão expirada');
  if (row.revokedAt) {
    if (Date.now() - row.revokedAt.getTime() > REUSE_GRACE_MS) await revokeAll(row.userId);
    throw new AppError('UNAUTHORIZED', 'Sessão expirada');
  }
  if (row.expiresAt < new Date() || !row.user.active || row.user.tenant.status !== 'ACTIVE') {
    throw new AppError('UNAUTHORIZED', 'Sessão expirada');
  }
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return { user: row.user, refreshToken: await createRefreshToken(row.userId, row.tenantId) };
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

const revokeAll = (userId: string) =>
  prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

/** Devolve o token em claro para ser entregue ao utilizador (ou null se o email não existe). */
export async function createPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return null;
  const token = newToken();
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  return { user, token };
}

export async function resetPassword(token: string, password: string, ip?: string) {
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new AppError('VALIDATION_ERROR', 'Link inválido ou expirado');
  }
  const passwordHash = await argon2.hash(password);
  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(
      {
        tenantId: row.tenantId,
        userId: row.userId,
        action: 'auth.password_reset',
        entity: 'User',
        entityId: row.userId,
        ip,
      },
      tx,
    );
  });
}

/** Dados da sessão para o frontend (utilizador, permissões, plano, features, unidades). */
export async function getSession(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      tenant: { omit: { logoData: true } },
      role: { include: { permissions: true } },
      userUnits: { include: { unit: true } },
    },
  });
  const units = user.allUnits
    ? await prisma.unit.findMany({
        where: { tenantId: user.tenantId, active: true },
        orderBy: { name: 'asc' },
      })
    : user.userUnits.map((u) => u.unit).filter((u) => u.active);
  return {
    user: { id: user.id, name: user.name, email: user.email },
    role: user.role.name,
    permissions: user.role.permissions.map((p) => p.code),
    tenant: {
      id: user.tenantId,
      name: user.tenant.name,
      plan: user.tenant.plan,
      logoUrl: logoUrl(user.tenant),
    },
    units: units.map((u) => ({ id: u.id, name: u.name })),
  };
}
