import { buildApp } from './app';
import { env } from './core/env';
import { startWorkers } from './jobs/queue';

const app = await buildApp();
if (env.RUN_WORKERS === 'true') startWorkers(app.log);
await app.listen({ port: env.PORT, host: '0.0.0.0' });
