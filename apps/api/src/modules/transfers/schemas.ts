import { z } from 'zod';
import { optText } from '../../core/schemas';

export const transferSchema = z.object({
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  notes: optText(1000),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.coerce.number().positive().max(99_999_999_999),
        /** unidade em que qty vem (omisso = unidade de stock) */
        unitId: z.string().min(1).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

export const receiveSchema = z.object({
  lines: z
    .array(z.object({ lineId: z.string().min(1), receivedQty: z.coerce.number().min(0) }))
    .min(1),
});
