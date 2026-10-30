import { expect, it } from 'vitest';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { env } from '../core/env';

/** Liga mesmo ao Redis: apanha dependências em falta (ex.: ioredis) que o modo inline dos testes esconde. */
it('BullMQ processa um job no Redis real', async () => {
  const u = new URL(env.REDIS_URL);
  const connection = { host: u.hostname, port: Number(u.port || 6379), maxRetriesPerRequest: null };
  const name = `smoke-${Date.now()}`;
  const queue = new Queue(name, { connection });
  const events = new QueueEvents(name, { connection });
  const worker = new Worker(name, async (job) => job.data.n * 2, { connection });
  try {
    await events.waitUntilReady();
    const job = await queue.add('x', { n: 21 });
    expect(await job.waitUntilFinished(events, 5000)).toBe(42);
  } finally {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }
});
