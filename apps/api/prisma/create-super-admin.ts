/**
 * Cria (ou reactiva) um Super Admin em produção.
 * Uso: SUPER_ADMIN_PASSWORD=... pnpm admin:create email@comunica.ao "Nome"
 */
import argon2 from 'argon2';
import { prisma } from '../src/core/prisma';

const [email, name] = process.argv.slice(2);
const password = process.env.SUPER_ADMIN_PASSWORD;
if (!email || !name || !password || password.length < 12) {
  console.error(
    'Uso: SUPER_ADMIN_PASSWORD=<min. 12 caracteres> pnpm admin:create <email> "<nome>"',
  );
  process.exit(1);
}
const passwordHash = await argon2.hash(password);
await prisma.superAdmin.upsert({
  where: { email: email.toLowerCase() },
  update: { name, passwordHash, active: true },
  create: { email: email.toLowerCase(), name, passwordHash },
});
console.log(`Super Admin ${email} pronto.`);
await prisma.$disconnect();
