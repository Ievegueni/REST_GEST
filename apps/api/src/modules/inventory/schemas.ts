import { z } from 'zod';
import { optText } from '../../core/schemas';

export const openSchema = z.object({
  locationId: z.string().min(1),
  categoryId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  blocksMovements: z.boolean().default(false),
  notes: optText(1000),
});

/** countedQty null = limpar contagem. Produtos fora da lista são acrescentados. */
export const countSchema = z.object({
  lines: z
    .array(
      z.object({ productId: z.string().min(1), countedQty: z.coerce.number().min(0).nullable() }),
    )
    .min(1)
    .max(2000),
});
