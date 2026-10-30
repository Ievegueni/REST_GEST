/** Processo só de workers BullMQ (produção: API com RUN_WORKERS=false + este processo). */
import { buildApp } from './app';
import { env } from './core/env';
import { startWorkers } from './jobs/queue';

const app = await buildApp(); // regista todos os módulos e, com eles, os jobs
if (!env.CLOUDINARY_URL) app.log.warn('CLOUDINARY_URL vazio: anexos gravados no disco local');
await startWorkers(app.log);
app.log.info('workers iniciados');
