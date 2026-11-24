import { z } from 'zod';

export const idParam = z.object({ id: z.string().min(1) });
export const name = z.string().trim().min(1).max(200);
/** nome de utilizador para o login: minúsculas, letras, números, ponto, hífen e sublinhado */
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'Utilizador: 3 a 40 caracteres (letras, números, . _ -)');
/** email opcional: '' vira null */
export const optEmail = z
  .union([z.literal(''), z.email()])
  .nullish()
  .transform((v) => v?.toLowerCase() || null);
/** texto opcional: '' vira null */
export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
/** Quantidade Decimal(14,3) */
export const qty = z.coerce.number().min(0).max(99_999_999_999);
/** Valor monetário em AOA (inteiro) */
export const money = z.coerce.number().int().min(0);
