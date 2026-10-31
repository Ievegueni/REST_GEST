import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AccessTokenPayload } from '../../core/auth';
import { env } from '../../core/env';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { audit } from '../../core/audit';
import { setTenantLogo } from '../../core/logo';
import { setSettings } from '../../core/platform-settings';
import {
  FUTURIX_KEYS,
  futurixConfig,
  normalizePhone,
  sendSms,
} from '../../integrations/futurix-sms';
import { taxTableSchema } from './schemas';
import * as service from './service';
import {
  adminLoginSchema,
  createTenantSchema,
  impersonateSchema,
  updateTenantSchema,
} from './schemas';

declare module 'fastify' {
  interface FastifyRequest {
    admin: { id: string; name: string; email: string };
  }
}

/** Sessão de Super Admin em cookie httpOnly (o token nunca chega ao JavaScript). */
const COOKIE = 'adm';
const TTL_S = 8 * 3600;
const cookieOpts = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/admin',
};

async function authenticateAdmin(req: FastifyRequest) {
  const unauthorized = new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada');
  let payload: AccessTokenPayload;
  try {
    payload = req.server.jwt.verify<AccessTokenPayload>(req.cookies[COOKIE] ?? '');
  } catch {
    throw unauthorized;
  }
  if (payload.typ !== 'admin') throw unauthorized;
  const admin = await prisma.superAdmin.findUnique({ where: { id: payload.sub } });
  if (!admin?.active) throw unauthorized;
  req.admin = { id: admin.id, name: admin.name, email: admin.email };
}

export async function adminRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { email, password } = adminLoginSchema.parse(req.body);
      const admin = await service.login(email, password);
      const token = app.jwt.sign({ typ: 'admin', sub: admin.id }, { expiresIn: TTL_S });
      reply.setCookie(COOKIE, token, { ...cookieOpts, maxAge: TTL_S });
      return { data: { id: admin.id, name: admin.name, email: admin.email } };
    },
  );

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, cookieOpts);
    return { data: { ok: true } };
  });

  await app.register(async (r) => {
    r.addHook('preHandler', authenticateAdmin);

    r.get('/me', async (req) => ({ data: req.admin }));

    // Tabelas de IRT/INSS (nacionais, versionadas por data de vigência)
    r.get('/tax-tables', async () => ({
      data: await prisma.taxTable.findMany({ orderBy: { validFrom: 'desc' } }),
    }));
    r.post('/tax-tables', async (req, reply) => {
      const data = taxTableSchema.parse(req.body);
      const t = await prisma.taxTable.create({ data });
      await audit({
        tenantId: null,
        userId: req.admin.id,
        action: 'admin.taxtable.create',
        entity: 'TaxTable',
        entityId: t.id,
        after: JSON.parse(JSON.stringify(data)),
      });
      return reply.status(201).send({ data: t });
    });
    r.put<{ Params: { id: string } }>('/tax-tables/:id', async (req) => {
      const data = taxTableSchema.parse(req.body);
      if (
        await prisma.payrollRun.count({
          where: { taxTableId: req.params.id, status: { not: 'DRAFT' } },
        })
      ) {
        throw new AppError('CONFLICT', 'Tabela usada em salários aprovados: crie uma nova versão');
      }
      const t = await prisma.taxTable.update({ where: { id: req.params.id }, data });
      await audit({
        tenantId: null,
        userId: req.admin.id,
        action: 'admin.taxtable.update',
        entity: 'TaxTable',
        entityId: t.id,
        after: JSON.parse(JSON.stringify(data)),
      });
      return { data: t };
    });

    r.get('/dashboard', async () => ({ data: await service.dashboard() }));

    // Integrações da plataforma: Futurix SMS (chave da COMUNICA, cifrada na BD)
    const futurixView = async () => {
      const c = await futurixConfig();
      return {
        url: c.url,
        sender: c.sender ?? '',
        keySet: Boolean(c.apiKey),
        keyHint: c.apiKey ? `••••${c.apiKey.slice(-4)}` : null,
        source: c.source,
        configured: Boolean(c.apiKey && c.sender),
      };
    };
    r.get('/integrations/futurix', async () => ({ data: await futurixView() }));
    r.put('/integrations/futurix', async (req) => {
      const b = z
        .object({
          url: z.string().trim().url('URL inválido').max(300),
          sender: z.string().trim().min(1, 'Indique o remetente').max(20),
          // string = nova chave; null = apagar; omisso = manter
          apiKey: z.string().trim().min(8, 'Chave demasiado curta').max(500).nullable().optional(),
        })
        .parse(req.body);
      await setSettings(
        {
          [FUTURIX_KEYS.url]: b.url,
          [FUTURIX_KEYS.sender]: b.sender,
          [FUTURIX_KEYS.apiKey]: b.apiKey,
        },
        { secret: [FUTURIX_KEYS.apiKey], by: req.admin.id },
      );
      await audit({
        tenantId: null,
        userId: req.admin.id,
        action: 'admin.integrations.futurix',
        entity: 'PlatformSetting',
        entityId: 'futurix',
        // nunca a chave: só se mudou
        after: {
          url: b.url,
          sender: b.sender,
          apiKey: b.apiKey === undefined ? 'mantida' : b.apiKey === null ? 'apagada' : 'alterada',
        },
        ip: req.ip,
      });
      return { data: await futurixView() };
    });
    r.post(
      '/integrations/futurix/test',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (req) => {
        const { to } = z.object({ to: z.string() }).parse(req.body);
        const phone = normalizePhone(to);
        if (!phone) throw new AppError('VALIDATION_ERROR', 'Número inválido (ex.: 923 456 789)');
        const res = await sendSms(phone, 'RestoGest: SMS de teste da integração Futurix.');
        return { data: { to: phone, ...res } };
      },
    );

    r.get('/tenants', async () => ({ data: await service.listTenants() }));

    r.post('/tenants', async (req, reply) => {
      const tenant = await service.create(createTenantSchema.parse(req.body), req.admin.id, req.ip);
      return reply.status(201).send({ data: tenant });
    });

    r.get<{ Params: { id: string } }>('/tenants/:id', async (req) => ({
      data: await service.getTenant(req.params.id),
    }));

    r.patch<{ Params: { id: string } }>('/tenants/:id', async (req) => ({
      data: await service.update(
        req.params.id,
        updateTenantSchema.parse(req.body),
        req.admin.id,
        req.ip,
      ),
    }));

    r.put<{ Params: { id: string } }>('/tenants/:id/logo', async (req) => {
      const file = await req.file();
      if (!file) throw new AppError('VALIDATION_ERROR', 'Ficheiro em falta');
      await service.getTenant(req.params.id); // 404 se não existir
      return {
        data: await setTenantLogo(req.params.id, await file.toBuffer(), {
          adminId: req.admin.id,
          ip: req.ip,
        }),
      };
    });
    r.delete<{ Params: { id: string } }>('/tenants/:id/logo', async (req) => ({
      data: await setTenantLogo(req.params.id, null, { adminId: req.admin.id, ip: req.ip }),
    }));

    // Impersonation: token de tenant curto (30 min, sem refresh) marcado com o id do Super Admin.
    r.post<{ Params: { id: string } }>('/tenants/:id/impersonate', async (req) => {
      const { userId } = impersonateSchema.parse(req.body ?? {});
      const user = await service.impersonationTarget(req.params.id, userId, req.admin.id, req.ip);
      const accessToken = app.jwt.sign(
        { typ: 'user', sub: user.id, tid: user.tenantId, imp: req.admin.id },
        { expiresIn: '30m' },
      );
      return { data: { accessToken } };
    });
  });
}
