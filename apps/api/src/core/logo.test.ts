import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../app';
import { createTestTenant, deleteTenants, multipart } from '../test-utils';
import { sniffImage } from './logo';
import { prisma, tenantDb } from './prisma';

// PNG 1×1 válido
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let token = '';
let limitedToken = '';
let adm = '';

const login = async (email: string) =>
  (
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'password123' },
    })
  ).json().data.accessToken as string;

const upload = (content: Buffer, auth = token, name = 'logo.png', type = 'image/png') => {
  const b = multipart(name, content, type);
  return app.inject({
    method: 'PUT',
    url: '/api/settings/logo',
    payload: b.payload,
    headers: { ...b.headers, authorization: `Bearer ${auth}` },
  });
};

beforeAll(async () => {
  T = await createTestTenant({ name: 'Logo', plan: 'STOCK', perms: [...PERMISSIONS] });
  token = await login(T.email);
  // utilizador sem settings.manage
  const db = tenantDb(T.tenant.id);
  const role = await db.role.create({
    data: { name: 'Consulta', permissions: { connect: [{ code: 'reports.view' }] } },
  });
  const u = await db.user.create({
    data: {
      email: `consulta-${T.tenant.id}@test.local`,
      name: 'Consulta',
      roleId: role.id,
      allUnits: true,
      passwordHash: await argon2.hash('password123'),
    },
  });
  limitedToken = await login(u.email);
  await prisma.superAdmin.upsert({
    where: { email: 'logo-admin@test.local' },
    update: {},
    create: {
      email: 'logo-admin@test.local',
      name: 'Logo admin',
      passwordHash: await argon2.hash('password123'),
    },
  });
  const r = await app.inject({
    method: 'POST',
    url: '/api/admin/auth/login',
    payload: { email: 'logo-admin@test.local', password: 'password123' },
  });
  adm = r.cookies.find((c) => c.name === 'adm')!.value;
});
afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await prisma.superAdmin.deleteMany({ where: { email: 'logo-admin@test.local' } });
  await app.close();
});

describe('logotipo do tenant', () => {
  it('reconhece o tipo pelo conteúdo', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('recusa ficheiros que não são imagem, SVG e acima de 512 KB; exige settings.manage', async () => {
    expect((await upload(Buffer.from('não sou png'))).statusCode).toBe(400);
    expect(
      (await upload(Buffer.from('<svg/>'), token, 'logo.svg', 'image/svg+xml')).statusCode,
    ).toBe(400);
    expect((await upload(Buffer.concat([PNG, Buffer.alloc(600 * 1024)]))).statusCode).toBe(400);
    expect((await upload(PNG, limitedToken)).statusCode).toBe(403);
  });

  it('grava, aparece na sessão, é servido sem sessão e entra no PDF', async () => {
    const res = await upload(PNG);
    expect(res.statusCode).toBe(200);
    const url = res.json().data.logoUrl as string;
    expect(url).toMatch(new RegExp(`^/api/tenant-logo/${T.tenant.id}\\?v=\\d+$`));

    const me = await app.inject({
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.json().data.tenant.logoUrl).toBe(url);

    const img = await app.inject({ url }); // sem autenticação
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload.equals(PNG)).toBe(true);

    const pdf = await app.inject({
      url: '/api/reports/stock?format=pdf',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('Super Admin: listagem sem os bytes, com logoUrl; pode remover', async () => {
    const list = await app.inject({ url: '/api/admin/tenants', cookies: { adm } });
    const row = list.json().data.find((t: { id: string }) => t.id === T.tenant.id);
    expect(row.logoUrl).toBeTruthy();
    expect(row).not.toHaveProperty('logoData');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/tenants/${T.tenant.id}/logo`,
      cookies: { adm },
    });
    expect(del.json().data.logoUrl).toBeNull();
    expect((await app.inject({ url: `/api/tenant-logo/${T.tenant.id}` })).statusCode).toBe(404);
  });
});
