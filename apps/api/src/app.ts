import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { env } from './core/env';
import { registerErrorHandler } from './core/errors';
import { prisma } from './core/prisma';
import { authRoutes } from './modules/auth/routes';
import { adminRoutes } from './modules/admin/routes';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
    },
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.APP_URL, credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_SECRET });
  registerErrorHandler(app);

  await app.register(
    async (api) => {
      api.get('/health', async () => {
        await prisma.$queryRaw`SELECT 1`;
        return { data: { status: 'ok' } };
      });
      await api.register(authRoutes);
      await api.register(adminRoutes, { prefix: '/admin' });
    },
    { prefix: '/api' },
  );

  return app;
}
