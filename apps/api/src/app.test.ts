import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';

const app = await buildApp();
afterAll(() => app.close());

describe('app', () => {
  it('GET /health', async () => {
    const res = await app.inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { status: 'ok' } });
  });

  it('404 no formato padrão', async () => {
    const res = await app.inject('/nao-existe');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
