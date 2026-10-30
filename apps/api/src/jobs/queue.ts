/**
 * Jobs BullMQ. Em testes o processador corre inline (sem Redis).
 * ponytail: os workers arrancam dentro do processo da API (RUN_WORKERS); separar num
 * processo PM2 próprio se a carga de importações o justificar.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../core/env';

const redis = new URL(env.REDIS_URL);
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  password: redis.password || undefined,
  maxRetriesPerRequest: null,
};

type Processor<T> = (data: T) => Promise<void>;
const registry: { name: string; processor: Processor<never> }[] = [];

export function defineJob<T>(name: string, processor: Processor<T>) {
  registry.push({ name, processor: processor as Processor<never> });
  let queue: Queue | undefined;
  return {
    async enqueue(data: T) {
      if (env.NODE_ENV === 'test') return processor(data);
      queue ??= new Queue(name, { connection });
      await queue.add(name, data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    },
  };
}

export function startWorkers(log: { error: (o: object, msg: string) => void }) {
  return registry.map(({ name, processor }) => {
    const w = new Worker(name, (job: Job) => processor(job.data as never), {
      connection,
      concurrency: 2,
    });
    w.on('failed', (job, err) => log.error({ job: job?.id, queue: name, err }, 'job failed'));
    return w;
  });
}
