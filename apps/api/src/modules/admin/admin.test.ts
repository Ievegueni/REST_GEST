import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { buildApp } from '../../app';
import { assertWithinLimit } from '../../core/limits';
import { prisma, tenantDb } from '../../core/prisma';
import { createTestTenant, deleteTenants } from '../../test-utils';

const app = await buildApp();
const suffix = Date.now();
const ADMIN_EMAIL = `sa-${suffix}@test.local`;
const NEW_ADMIN_EMAIL = `novo-${suffix}@test.local`;
const tenantIds: string[] = [];
let adm = ''; // cookie de sessão do Super Admin
let newTenantId = '';

const as = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) =>
  app.inject({ method, url, payload, cookies: { adm } });

const tenantLogin = (email: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'password123' },
  });

beforeAll(async () => {
  await prisma.superAdmin.create({
    data: { email: ADMIN_EMAIL, name: 'SA', passwordHash: await argon2.hash('superpassword') },
  });
});

afterAll(async () => {
  await deleteTenants(tenantIds);
  await prisma.superAdmin.deleteMany({ where: { email: ADMIN_EMAIL } });
  await app.close();
  await prisma.$disconnect();
});

describe('auth do Super Admin', () => {
  it('rejeita senha errada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { email: ADMIN_EMAIL, password: 'errada' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('login define cookie httpOnly restrito a /api/admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { email: ADMIN_EMAIL, password: 'superpassword' },
    });
    const c = res.cookies.find((c) => c.name === 'adm')!;
    expect(c.httpOnly).toBe(true);
    expect(c.path).toBe('/api/admin');
    adm = c.value;
  });

  it('tokens de tenant e de admin não são intercambiáveis', async () => {
    const t = await createTestTenant({ name: 'AdmX' });
    tenantIds.push(t.tenant.id);
    const userToken = (await tenantLogin(t.email)).json().data.accessToken;

    const r1 = await app.inject({ url: '/api/admin/tenants', cookies: { adm: userToken } });
    expect(r1.statusCode).toBe(401);
    const r2 = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${adm}` } });
    expect(r2.statusCode).toBe(401);
    expect((await app.inject({ url: '/api/admin/tenants' })).statusCode).toBe(401);
  });
});

describe('gestão de tenants', () => {
  it('cria tenant com perfis base e primeiro administrador', async () => {
    const res = await as('POST', '/api/admin/tenants', {
      name: 'Novo Cliente',
      plan: 'STOCK',
      maxUnits: 2,
      admin: { name: 'Dono', email: NEW_ADMIN_EMAIL, password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    newTenantId = res.json().data.id;
    tenantIds.push(newTenantId);

    expect(await prisma.role.count({ where: { tenantId: newTenantId, isSystem: true } })).toBe(6);
    expect((await tenantLogin(NEW_ADMIN_EMAIL)).statusCode).toBe(200);
  });

  it('email de administrador duplicado → 409', async () => {
    const res = await as('POST', '/api/admin/tenants', {
      name: 'Outro',
      admin: { name: 'X', email: NEW_ADMIN_EMAIL, password: 'password123' },
    });
    expect(res.statusCode).toBe(409);
    expect(await prisma.tenant.count({ where: { name: 'Outro', id: { notIn: tenantIds } } })).toBe(
      0,
    );
  });

  it('troca de plano tem efeito imediato e fica na auditoria', async () => {
    const token = (await tenantLogin(NEW_ADMIN_EMAIL)).json().data.accessToken;
    const features = async () =>
      (await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } })).json()
        .data.features as string[];
    expect(await features()).not.toContain('hr');

    const res = await as('PATCH', `/api/admin/tenants/${newTenantId}`, {
      plan: 'COMPLETO',
      featureOverrides: { ai_analyzer: false },
    });
    expect(res.statusCode).toBe(200);
    const f = await features();
    expect(f).toContain('hr');
    expect(f).not.toContain('ai_analyzer');

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: newTenantId, action: 'admin.tenant.update' },
    });
    expect(log.before).toMatchObject({ plan: 'STOCK' });
    expect(log.after).toMatchObject({ plan: 'COMPLETO', featureOverrides: { ai_analyzer: false } });
  });

  it('rejeita overrides de features desconhecidas', async () => {
    const res = await as('PATCH', `/api/admin/tenants/${newTenantId}`, {
      featureOverrides: { voar: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('suspensão bloqueia o login do tenant', async () => {
    await as('PATCH', `/api/admin/tenants/${newTenantId}`, { status: 'SUSPENDED' });
    expect((await tenantLogin(NEW_ADMIN_EMAIL)).statusCode).toBe(403);
    await as('PATCH', `/api/admin/tenants/${newTenantId}`, { status: 'ACTIVE' });
  });

  it('painel: carteira, uso do mês e série de 30 dias', async () => {
    const d = (await as('GET', '/api/admin/dashboard')).json().data;
    expect(d.tenants.total).toBeGreaterThanOrEqual(1);
    expect(d.tenants.completo + d.tenants.stock).toBe(d.tenants.total);
    expect(d.daily.days).toHaveLength(30);
    expect(d.daily.ai).toHaveLength(30);
    expect(d.month).toHaveProperty('aiCostUsd');
    // sem sessão de Super Admin → 401
    expect((await app.inject({ url: '/api/admin/dashboard' })).statusCode).toBe(401);
  });

  it('integração Futurix: chave cifrada, mascarada, sem chave na auditoria; teste de envio', async () => {
    const before = (await as('GET', '/api/admin/integrations/futurix')).json().data;
    expect(before.keySet).toBe(false);

    const secretKey = 'fx_live_ABCDEFGH1234';
    const put = await as('PUT', '/api/admin/integrations/futurix', {
      url: 'http://127.0.0.1:9',
      sender: 'RESTOGEST',
      apiKey: secretKey,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data).toMatchObject({ keySet: true, keyHint: '••••1234', configured: true });
    expect(JSON.stringify(put.json())).not.toContain(secretKey);

    const row = await prisma.platformSetting.findUniqueOrThrow({
      where: { key: 'futurix.apiKey' },
    });
    expect(row.secret).toBe(true);
    expect(row.value).not.toContain(secretKey);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'admin.integrations.futurix' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(log)).not.toContain(secretKey);

    // omitir a chave mantém-na
    await as('PUT', '/api/admin/integrations/futurix', {
      url: 'http://127.0.0.1:9',
      sender: 'OUTRO',
    });
    expect((await as('GET', '/api/admin/integrations/futurix')).json().data).toMatchObject({
      keySet: true,
      sender: 'OUTRO',
    });

    expect(
      (await as('POST', '/api/admin/integrations/futurix/test', { to: '123' })).statusCode,
    ).toBe(400);
    const test = (
      await as('POST', '/api/admin/integrations/futurix/test', { to: '923456789' })
    ).json().data;
    expect(test).toMatchObject({ to: '+244923456789', ok: false }); // servidor inexistente

    // null apaga
    await as('PUT', '/api/admin/integrations/futurix', {
      url: 'http://127.0.0.1:9',
      sender: 'OUTRO',
      apiKey: null,
    });
    expect((await as('GET', '/api/admin/integrations/futurix')).json().data.keySet).toBe(false);
    await prisma.platformSetting.deleteMany();
  });

  it('lista e detalhe com contagens e utilizadores', async () => {
    const list = (await as('GET', '/api/admin/tenants')).json().data;
    expect(list.some((t: { id: string }) => t.id === newTenantId)).toBe(true);
    const detail = (await as('GET', `/api/admin/tenants/${newTenantId}`)).json().data;
    expect(detail.users[0]).toMatchObject({
      email: NEW_ADMIN_EMAIL,
      role: { name: 'Administrador' },
    });
    expect(detail.users[0].passwordHash).toBeUndefined();
  });
});

describe('impersonation', () => {
  it('entra como administrador do tenant e regista na auditoria', async () => {
    const res = await as('POST', `/api/admin/tenants/${newTenantId}/impersonate`);
    const me = (
      await app.inject({
        url: '/api/me',
        headers: { authorization: `Bearer ${res.json().data.accessToken}` },
      })
    ).json().data;
    expect(me.user.email).toBe(NEW_ADMIN_EMAIL);
    expect(me.impersonated).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: newTenantId, action: 'admin.impersonate' },
      }),
    ).toBe(1);
  });

  it('não impersona utilizador de outro tenant', async () => {
    const other = await prisma.user.findFirstOrThrow({ where: { tenantId: tenantIds[0] } });
    const res = await as('POST', `/api/admin/tenants/${newTenantId}/impersonate`, {
      userId: other.id,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('limites', () => {
  it('bloqueia unidades acima do limite', async () => {
    const db = tenantDb(newTenantId);
    await assertWithinLimit(newTenantId, 'units');
    await db.unit.create({ data: { name: 'U1' } });
    await db.unit.create({ data: { name: 'U2' } });
    await expect(assertWithinLimit(newTenantId, 'units')).rejects.toThrow('Limite');
    await assertWithinLimit(newTenantId, 'users'); // sem limite de utilizadores
  });
});
