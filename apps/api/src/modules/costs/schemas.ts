import { z } from 'zod';
import { money, name, optText } from '../../core/schemas';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optId = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

export const categorySchema = z.object({ name, active: z.boolean().default(true) });
export const paymentMethodSchema = z.object({
  name,
  isCash: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const dailyCostSchema = z.object({
  unitId: z.string().min(1),
  date: day.transform((v) => new Date(v)),
  categoryId: z.string().min(1),
  description: optText(500),
  amount: money.refine((v) => v > 0, 'Valor obrigatório'),
  paymentMethodId: optId,
  attachmentUrl: z
    .string()
    .max(500)
    .nullish()
    .transform((v) => v || null),
  attachmentName: optText(200),
});

export const recurringSchema = z.object({
  unitId: z.string().min(1),
  categoryId: z.string().min(1),
  description: z.string().trim().min(1).max(200),
  amount: money.refine((v) => v > 0, 'Valor obrigatório'),
  dayOfMonth: z.coerce.number().int().min(1).max(28),
  active: z.boolean().default(true),
});

export const listQuery = z.object({
  unitId: z.string().optional(),
  from: day.optional(),
  to: day.optional(),
  categoryId: z.string().optional(),
});
