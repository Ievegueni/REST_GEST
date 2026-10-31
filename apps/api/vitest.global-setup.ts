import { execSync } from 'node:child_process';

/** Cria/actualiza a base de testes com as migrações antes de correr os testes. */
export default function setup() {
  execSync('pnpm exec prisma migrate deploy', { stdio: 'pipe', env: process.env });
}
