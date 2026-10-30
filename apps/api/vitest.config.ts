import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { env: loadEnv(), fileParallelism: false },
});

function loadEnv() {
  try {
    process.loadEnvFile('../../.env');
  } catch {
    /* CI define as variáveis directamente */
  }
  return {};
}
