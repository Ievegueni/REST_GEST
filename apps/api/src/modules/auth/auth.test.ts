import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app';
import { authenticate, canAccessUnit, requireFeature, requirePermission } from '../../core/auth';
import { prisma } from '../../core/prisma';
import { createTestTenant, deleteTenants } from '../../test-utils';
import { createPasswordReset } from './service';

const app = await buildApp();
await app.register(
  async (t) => {
    t.addHook('preHandler', authenticate);
    t.get('/hr', { preHandler: requireFeature('hr') }, async () => ({ data: 'ok' }));
    t.get('/adjust', { preHandler: requirePermission('stock.adjust') }, async () => ({
      data: 'ok',
    }));
  },
  { prefix: '/api/test' },
);

let A: Awaited<ReturnType<typeof createTestTenant>>;
let B: Awaited<ReturnType<typeof createTestTenant>>;
let tokenA: string, tokenB: string;

const cookieOf = (res: LightMyRequestResponse) =>
  res.cookies.find((c) => c.name === 'rt')?.value ?? '';

const login = (email: string, password = 'password123') =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });

const get = (url: string, token?: string) =>
  app.inject({ url, headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeAll(async () => {
  A = await createTestTenant({ name: 'AuthA', plan: 'STOCK', perms: ['reports.view'] });
  B = await createTestTenant({ name: 'AuthB', plan: 'COMPLETO', perms: ['stock.adjust'] });
  tokenA = (await login(A.email)).json().data.accessToken;
  tokenB = (await login(B.email)).json().data.accessToken;
});

afterAll(async () => {
  await deleteTenants([A.tenant.id, B.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('login', () => {
  it('rejeita senha errada e email inexistente com a mesma mensagem', async () => {
    const r1 = await login(A.email, 'errada123');
    const r2 = await login('ninguem@test.local');
    expect(r1.statusCode).toBe(401);
    expect(r2.json()).toEqual(r1.json());
  });

  it('devolve access token e cookie httpOnly de refresh', async () => {
    const res = await login(A.email);
    expect(res.json().data.accessToken).toBeTypeOf('string');
    const c = res.cookies.find((c) => c.name === 'rt');
    expect(c?.httpOnly).toBe(true);
    expect(c?.path).toBe('/api/auth');
  });
});

describe('/me e isolamento', () => {
  it('exige token', async () => {
    expect((await get('/api/me')).statusCode).toBe(401);
  });

  it('só mostra dados do próprio tenant', async () => {
    const me = (await get('/api/me', tokenA)).json().data;
    expect(me.tenant.id).toBe(A.tenant.id);
    expect(me.units.map((u: { id: string }) => u.id)).toEqual([A.unit.id]);
    expect(me.permissions).toEqual(['reports.view']);
    expect(me.features).not.toContain('hr');
  });

  it('tenant suspenso fica bloqueado', async () => {
    await prisma.tenant.update({ where: { id: A.tenant.id }, data: { status: 'SUSPENDED' } });
    expect((await get('/api/me', tokenA)).statusCode).toBe(403);
    await prisma.tenant.update({ where: { id: A.tenant.id }, data: { status: 'ACTIVE' } });
  });
});

describe('features e permissões', () => {
  it('plano STOCK não acede a rotas de RH', async () => {
    const res = await get('/api/test/hr', tokenA);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FEATURE_NOT_IN_PLAN');
    expect((await get('/api/test/hr', tokenB)).statusCode).toBe(200);
  });

  it('override de feature tem efeito imediato', async () => {
    await prisma.tenant.update({
      where: { id: A.tenant.id },
      data: { featureOverrides: { hr: true } },
    });
    expect((await get('/api/test/hr', tokenA)).statusCode).toBe(200);
    await prisma.tenant.update({ where: { id: A.tenant.id }, data: { featureOverrides: {} } });
  });

  it('requirePermission bloqueia sem permissão', async () => {
    const res = await get('/api/test/adjust', tokenA);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    expect((await get('/api/test/adjust', tokenB)).statusCode).toBe(200);
  });

  it('canAccessUnit respeita UserUnit', () => {
    const base = { unitIds: ['u1'] } as never;
    expect(canAccessUnit(base, 'u1')).toBe(true);
    expect(canAccessUnit(base, 'u2')).toBe(false);
    expect(canAccessUnit({ unitIds: 'all' } as never, 'u2')).toBe(true);
  });
});

describe('refresh e logout', () => {
  it('roda o token; reutilizar o antigo revoga a sessão toda', async () => {
    const rt1 = cookieOf(await login(B.email));
    const refresh = (rt: string) =>
      app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { rt } });

    const r2 = await refresh(rt1);
    expect(r2.statusCode).toBe(200);
    const rt2 = cookieOf(r2);

    // reutilização imediata (abas concorrentes): 401 mas não mata a sessão
    expect((await refresh(rt1)).statusCode).toBe(401);
    const r3 = await refresh(rt2);
    expect(r3.statusCode).toBe(200);

    // reutilização fora da margem = roubo: revoga tudo
    await prisma.refreshToken.updateMany({
      where: { userId: B.user.id, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    expect((await refresh(rt1)).statusCode).toBe(401);
    expect((await refresh(cookieOf(r3))).statusCode).toBe(401);
  });

  it('logout revoga o refresh token', async () => {
    const rt = cookieOf(await login(B.email));
    await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { rt } });
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { rt } });
    expect(res.statusCode).toBe(401);
  });
});

describe('recuperação de senha', () => {
  it('forgot responde igual para email inexistente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'ninguem@test.local' },
    });
    expect(res.json()).toEqual({ data: { ok: true } });
  });

  it('reset troca a senha e o token só serve uma vez', async () => {
    const { token } = (await createPasswordReset(A.email))!;
    const reset = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token, password: 'novaSenha123' },
      });
    expect((await reset()).statusCode).toBe(200);
    expect((await reset()).statusCode).toBe(400);
    expect((await login(A.email, 'novaSenha123')).statusCode).toBe(200);
  });
});
