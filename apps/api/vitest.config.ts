import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { env: loadEnv(), fileParallelism: false, globalSetup: './vitest.global-setup.ts' },
});

/** Testes numa base própria (<base>_test), para não deixar dados na base de desenvolvimento. */
function loadEnv() {
  try {
    process.loadEnvFile('../../.env');
  } catch {
    /* CI define as variáveis directamente */
  }
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) url.pathname += '_test';
  process.env.DATABASE_URL = url.toString();
  return { DATABASE_URL: url.toString() };
}
