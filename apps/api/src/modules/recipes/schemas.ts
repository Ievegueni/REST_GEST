import { z } from 'zod';
import { money, name, optText } from '../../core/schemas';

export const saleItemSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name,
  salePrice: money.nullish().transform((v) => v ?? null),
  isSubRecipe: z.boolean().default(false),
  yieldQty: z.coerce.number().positive().max(1_000_000).default(1),
  yieldUnit: optText(20),
  active: z.boolean().default(true),
  lines: z
    .array(
      z
        .object({
          productId: z
            .string()
            .min(1)
            .nullish()
            .transform((v) => v ?? null),
          subRecipeId: z
            .string()
            .min(1)
            .nullish()
            .transform((v) => v ?? null),
          unitId: z
            .string()
            .min(1)
            .nullish()
            .transform((v) => v ?? null),
          qty: z.coerce.number().positive().max(1_000_000),
          lossPct: z.coerce.number().min(0).max(95).default(0),
        })
        .refine((l) => !!l.productId !== !!l.subRecipeId, {
          message: 'Indique um produto ou uma sub-receita',
        }),
    )
    .max(200)
    .default([]),
});

export const outputLocationsSchema = z.array(
  z.object({
    categoryId: z.string().min(1),
    unitId: z.string().min(1),
    locationId: z.string().min(1).nullable(),
  }),
);
