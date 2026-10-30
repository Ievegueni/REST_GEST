import { z } from 'zod';

export const idParam = z.object({ id: z.string().min(1) });
export const name = z.string().trim().min(1).max(200);
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
