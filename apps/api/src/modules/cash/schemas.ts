import { z } from 'zod';
import { money, optText } from '../../core/schemas';

export const openSchema = z.object({
  unitId: z.string().min(1),
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .transform((v) => new Date(v)),
  shift: z.string().trim().max(50).default(''),
  openingFloat: money,
  notes: optText(500),
});

export const amountsSchema = z.object({
  amounts: z
    .array(
      z.object({
        paymentMethodId: z.string().min(1),
        systemAmount: z.coerce.number().int().optional(),
        countedAmount: z.coerce.number().int().min(0).nullable().optional(),
      }),
    )
    .max(50),
  /** contagem por notas: { "5000": 3 } */
  denominations: z
    .record(z.string().regex(/^\d+$/), z.coerce.number().int().min(0))
    .nullable()
    .optional(),
});

export const movementSchema = z.object({
  type: z.enum(['WITHDRAWAL', 'DEPOSIT', 'EXPENSE']),
  amount: money.refine((v) => v > 0, 'Valor obrigatório'),
  description: z.string().trim().min(1).max(300),
  categoryId: z.string().min(1).nullish(),
});

export const closeSchema = z.object({ justification: optText(1000) });
