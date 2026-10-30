import { z } from 'zod';
import { optText } from '../../core/schemas';

/** Tipos que se registam à mão; os restantes nascem de documentos (compras, transferências…). */
export const MANUAL_TYPES = [
  'PURCHASE_IN',
  'CONSUMPTION',
  'WASTE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
] as const;
const NEEDS_REASON = ['WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'];

export const manualMovementSchema = z
  .object({
    locationId: z.string().min(1),
    occurredAt: z.coerce.date().optional(),
    reason: optText(300),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          type: z.enum(MANUAL_TYPES),
          qty: z.coerce.number().positive().max(99_999_999_999),
          unitId: z.string().min(1).nullish(),
          unitCost: z.coerce.number().min(0).nullish(),
          reason: optText(300),
          lotId: z.string().min(1).nullish(),
          lotCode: optText(50),
          expiryDate: z.coerce.date().nullish(),
        }),
      )
      .min(1)
      .max(200),
  })
  .superRefine((v, ctx) => {
    v.items.forEach((i, n) => {
      if (NEEDS_REASON.includes(i.type) && !(i.reason ?? v.reason)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', n, 'reason'],
          message: 'Motivo obrigatório',
        });
      }
      if (i.type === 'PURCHASE_IN' && i.unitCost == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', n, 'unitCost'],
          message: 'Custo obrigatório na entrada',
        });
      }
    });
  });

export const balancesQuery = z.object({
  unitId: z.string().optional(),
  locationId: z.string().optional(),
  categoryId: z.string().optional(),
  search: optText(100),
  belowMin: z.enum(['true', 'false']).optional(),
});

export const kardexQuery = z.object({
  locationId: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
