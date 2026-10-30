import { z } from 'zod';
import { name, optText, qty } from '../../core/schemas';

export const categorySchema = z.object({
  name,
  parentId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  active: z.boolean().default(true),
});

export const measureUnitSchema = z.object({
  name,
  symbol: z.string().trim().min(1).max(20),
});

const optId = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

const productBase = {
  code: z.string().trim().min(1).max(50),
  name,
  categoryId: z.string().min(1),
  stockUnitId: z.string().min(1),
  purchaseUnitId: optId,
  consumptionUnitId: optId,
  tracksLots: z.boolean().default(false),
  reorderPoint: qty.nullish().transform((v) => v ?? null),
  preferredSupplierId: optId,
  active: z.boolean().default(true),
  conversions: z
    .array(z.object({ unitId: z.string().min(1), factor: z.coerce.number().positive().max(1e9) }))
    .default([]),
  limits: z
    .array(
      z
        .object({
          locationId: z.string().min(1),
          minQty: qty.nullish().transform((v) => v ?? null),
          maxQty: qty.nullish().transform((v) => v ?? null),
        })
        .refine((l) => l.minQty == null || l.maxQty == null || l.minQty <= l.maxQty, {
          message: 'Mínimo maior que o máximo',
        }),
    )
    .default([]),
};

export const productSchema = z.object(productBase);
export const productPatchSchema = z.object(productBase).partial();

export const productListQuery = z.object({
  search: optText(100),
  categoryId: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
});
