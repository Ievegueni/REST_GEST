import { z } from 'zod';
import { money, optText } from '../../core/schemas';

const qty = z.coerce.number().positive().max(99_999_999_999);
const optDate = z.coerce
  .date()
  .nullish()
  .transform((v) => v ?? null);

export const orderSchema = z.object({
  supplierId: z.string().min(1),
  unitId: z.string().min(1),
  expectedDate: optDate,
  notes: optText(1000),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        unitId: z.string().min(1),
        qty,
        unitPrice: money.nullish().transform((v) => v ?? null),
      }),
    )
    .min(1)
    .max(500),
});

export const orderStatusSchema = z.object({ status: z.enum(['SENT', 'CANCELLED']) });

export const receiptSchema = z.object({
  supplierId: z.string().min(1),
  locationId: z.string().min(1),
  orderId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  invoiceNumber: optText(50),
  invoiceDate: optDate,
  receivedAt: z.coerce.date().optional(),
  attachmentUrl: z
    .string()
    .max(500)
    .nullish()
    .transform((v) => v || null),
  attachmentName: optText(200),
  notes: optText(1000),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        orderLineId: z
          .string()
          .min(1)
          .nullish()
          .transform((v) => v ?? null),
        unitId: z.string().min(1),
        qty,
        unitPrice: money,
        lotCode: optText(50),
        expiryDate: optDate,
      }),
    )
    .min(1)
    .max(500),
});

export const listQuery = z.object({
  status: z.string().optional(),
  supplierId: z.string().optional(),
});
