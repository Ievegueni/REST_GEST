import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { env } from './core/env';
import { registerErrorHandler } from './core/errors';
import { prisma } from './core/prisma';
import { authRoutes } from './modules/auth/routes';
import { adminRoutes } from './modules/admin/routes';
import { catalogRoutes } from './modules/catalog/routes';
import { supplierRoutes } from './modules/suppliers/routes';
import { unitRoutes } from './modules/units/routes';
import { userRoutes } from './modules/users/routes';
import { stockRoutes } from './modules/stock/routes';
import { settingsRoutes } from './modules/settings-routes';
import { purchaseRoutes } from './modules/purchases/routes';
import { transferRoutes } from './modules/transfers/routes';
import { inventoryRoutes } from './modules/inventory/routes';
import { fileRoutes } from './modules/files/routes';
import { recipeRoutes } from './modules/recipes/routes';
import { salesImportRoutes } from './modules/sales-import/routes';
import { alertRoutes } from './modules/alerts/routes';
import { reportRoutes } from './modules/reports/routes';
import { hrRoutes } from './modules/hr/routes';
import { payrollRoutes } from './modules/payroll/routes';
import { costRoutes } from './modules/costs/routes';
import { cashRoutes } from './modules/cash/routes';
import { payableRoutes } from './modules/payables/routes';
import { financialRoutes } from './modules/financial/routes';

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
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  registerErrorHandler(app);

  await app.register(
    async (api) => {
      api.get('/health', async () => {
        await prisma.$queryRaw`SELECT 1`;
        return { data: { status: 'ok' } };
      });
      await api.register(authRoutes);
      await api.register(adminRoutes, { prefix: '/admin' });
      await api.register(unitRoutes);
      await api.register(userRoutes);
      await api.register(catalogRoutes);
      await api.register(supplierRoutes);
      await api.register(stockRoutes);
      await api.register(settingsRoutes);
      await api.register(purchaseRoutes);
      await api.register(transferRoutes);
      await api.register(inventoryRoutes);
      await api.register(fileRoutes);
      await api.register(recipeRoutes);
      await api.register(salesImportRoutes);
      await api.register(alertRoutes);
      await api.register(reportRoutes);
      await api.register(hrRoutes);
      await api.register(payrollRoutes);
      await api.register(costRoutes);
      await api.register(cashRoutes);
      await api.register(payableRoutes);
      await api.register(financialRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
