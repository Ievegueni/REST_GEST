import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../core/auth';
import { env } from '../../core/env';
import * as service from './service';
import { forgotSchema, loginSchema, resetSchema } from './schemas';

const COOKIE = 'rt';
const cookieOpts = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
};

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  const sendTokens = (
    reply: FastifyReply,
    user: { id: string; tenantId: string },
    refresh: string,
  ) => {
    reply.setCookie(COOKIE, refresh, { ...cookieOpts, maxAge: service.REFRESH_TTL_MS / 1000 });
    return {
      data: {
        accessToken: app.jwt.sign(
          { typ: 'user', sub: user.id, tid: user.tenantId },
          { expiresIn: '15m' },
        ),
      },
    };
  };

  app.post('/auth/login', strict, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const { user, refreshToken } = await service.login(email, password, req.ip);
    return sendTokens(reply, user, refreshToken);
  });

  app.post('/auth/refresh', async (req, reply) => {
    const { user, refreshToken } = await service.rotateRefreshToken(req.cookies[COOKIE] ?? '');
    return sendTokens(reply, user, refreshToken);
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await service.revokeRefreshToken(token);
    reply.clearCookie(COOKIE, cookieOpts);
    return { data: { ok: true } };
  });

  app.post('/auth/forgot-password', strict, async (req) => {
    const { email } = forgotSchema.parse(req.body);
    const reset = await service.createPasswordReset(email);
    if (reset) {
      const link = `${env.APP_URL}/redefinir-senha?token=${reset.token}`;
      // ponytail: sem canal de entrega até ao Sprint 7 (SMS Futurix); em dev o link vai para o log.
      if (env.NODE_ENV !== 'production') req.log.info({ link }, 'password reset link');
    }
    // Resposta igual quer o email exista ou não.
    return { data: { ok: true } };
  });

  app.post('/auth/reset-password', strict, async (req) => {
    const { token, password } = resetSchema.parse(req.body);
    await service.resetPassword(token, password, req.ip);
    return { data: { ok: true } };
  });

  app.get('/me', { preHandler: authenticate }, async (req) => {
    const session = await service.getSession(req.auth.userId);
    return {
      data: {
        ...session,
        features: [...req.auth.features],
        impersonated: Boolean(req.auth.impersonatorId),
      },
    };
  });
}
