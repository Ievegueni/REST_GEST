/**
 * Jobs BullMQ. Em testes o processador corre inline (sem Redis), excepto jobs com inlineInTests=false,
 * que nos testes são ignorados e chamados directamente.
 * ponytail: os workers arrancam dentro do processo da API (RUN_WORKERS); separar num
 * processo PM2 próprio se a carga o justificar.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../core/env';

const redis = new URL(env.REDIS_URL);
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username ? decodeURIComponent(redis.username) : undefined,
  password: redis.password ? decodeURIComponent(redis.password) : undefined,
  db: Number(redis.pathname.slice(1)) || 0,
  maxRetriesPerRequest: null,
};

type Processor<T> = (data: T) => Promise<void>;
type Definition = { name: string; processor: Processor<never>; every?: { pattern: string } };
const registry: Definition[] = [];
const queues = new Map<string, Queue>();
const queue = (name: string) => {
  let q = queues.get(name);
  if (!q) queues.set(name, (q = new Queue(name, { connection })));
  return q;
};

export function defineJob<T>(
  name: string,
  processor: Processor<T>,
  opts: { inlineInTests?: boolean; every?: { pattern: string } } = {},
) {
  registry.push({ name, processor: processor as Processor<never>, every: opts.every });
  return {
    async enqueue(data: T, o: { delay?: number; jobId?: string } = {}) {
      if (env.NODE_ENV === 'test')
        return opts.inlineInTests === false ? undefined : processor(data);
      await queue(name).add(name, data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
        ...o,
      });
    },
    run: processor,
  };
}

export async function startWorkers(log: { error: (o: object, msg: string) => void }) {
  for (const { name, processor, every } of registry) {
    const w = new Worker(name, (job: Job) => processor(job.data as never), {
      connection,
      concurrency: 2,
    });
    w.on('failed', (job, err) => log.error({ job: job?.id, queue: name, err }, 'job failed'));
    // jobs periódicos (cron no fuso de apresentação)
    if (every)
      await queue(name).upsertJobScheduler(
        `${name}-schedule`,
        { pattern: every.pattern, tz: env.TZ_DISPLAY },
        { name, data: {} },
      );
  }
}
