import type { FastifyRequest } from 'fastify';
import {
  effectiveFeatures,
  PERMISSIONS,
  type Feature,
  type FeatureOverrides,
  type Permission,
  type Plan,
} from '@restgest/shared';
import { AppError } from './errors';
import { prisma, tenantDb, type TenantDb } from './prisma';

export type AuthContext = {
  userId: string;
  tenantId: string;
  plan: Plan;
  permissions: Set<string>;
  features: Set<Feature>;
  /** 'all' = acesso a todas as unidades do tenant */
  unitIds: 'all' | string[];
  db: TenantDb;
  /** id do SuperAdmin quando a sessão é uma impersonation */
  impersonatorId?: string;
};

export type AccessTokenPayload =
  { typ: 'user'; sub: string; tid: string; imp?: string } | { typ: 'admin'; sub: string };

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

/**
 * preHandler: valida o JWT e carrega utilizador, permissões e plano.
 * ponytail: 1 query por pedido (reflecte logo suspensões e mudanças de plano); cache em Redis se pesar.
 */
export async function authenticate(req: FastifyRequest) {
  let payload: AccessTokenPayload;
  try {
    payload = await req.jwtVerify<AccessTokenPayload>();
  } catch {
    throw new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada');
  }
  if (payload.typ !== 'user') throw new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada');
  const user = await prisma.user.findFirst({
    where: { id: payload.sub, tenantId: payload.tid, active: true },
    include: { tenant: true, role: { include: { permissions: true } }, userUnits: true },
  });
  if (!user) throw new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada');
  if (user.tenant.status !== 'ACTIVE') throw new AppError('FORBIDDEN', 'Conta suspensa');

  req.auth = {
    userId: user.id,
    tenantId: user.tenantId,
    plan: user.tenant.plan,
    permissions: new Set(user.role.permissions.map((p) => p.code)),
    features: effectiveFeatures(user.tenant.plan, user.tenant.featureOverrides as FeatureOverrides),
    unitIds: user.allUnits ? 'all' : user.userUnits.map((u) => u.unitId),
    db: tenantDb(user.tenantId),
    impersonatorId: payload.imp,
  };
}

export const requirePermission = (permission: Permission) => async (req: FastifyRequest) => {
  if (!req.auth.permissions.has(permission)) {
    throw new AppError('FORBIDDEN', 'Sem permissão para esta operação', { permission });
  }
};

export const requireFeature = (feature: Feature) => async (req: FastifyRequest) => {
  if (!req.auth.features.has(feature)) {
    throw new AppError('FEATURE_NOT_IN_PLAN', 'Funcionalidade não incluída no plano', {
      feature,
    });
  }
};

export function canAccessUnit(auth: AuthContext, unitId: string) {
  return auth.unitIds === 'all' || auth.unitIds.includes(unitId);
}

export function assertUnitAccess(auth: AuthContext, unitId: string) {
  if (!canAccessUnit(auth, unitId)) throw new AppError('FORBIDDEN', 'Sem acesso a esta unidade');
}

/** Opções de rota: autenticação + feature do plano + permissão. */
export function protect(opts: { feature?: Feature; permission?: Permission } = {}) {
  return {
    preHandler: [
      authenticate,
      ...(opts.feature ? [requireFeature(opts.feature)] : []),
      ...(opts.permission ? [requirePermission(opts.permission)] : []),
    ],
  };
}

/** Features efectivas de um tenant fora de um pedido (jobs). */
export async function tenantFeatures(tenantId: string) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return t.status === 'ACTIVE'
    ? effectiveFeatures(t.plan, t.featureOverrides as FeatureOverrides)
    : new Set<Feature>();
}

/** Contexto de sistema para jobs (sem utilizador): todas as permissões, unidades indicadas. */
export async function systemAuth(
  tenantId: string,
  unitIds: AuthContext['unitIds'] = 'all',
): Promise<AuthContext> {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return {
    userId: 'system',
    tenantId,
    plan: t.plan,
    permissions: new Set(PERMISSIONS),
    features: await tenantFeatures(tenantId),
    unitIds,
    db: tenantDb(tenantId),
  };
}
