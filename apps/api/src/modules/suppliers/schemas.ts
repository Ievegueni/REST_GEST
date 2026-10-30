import { z } from 'zod';
import { money, name, optText } from '../../core/schemas';

export const supplierSchema = z.object({
  name,
  nif: optText(50),
  contactName: optText(200),
  phone: optText(30),
  email: optText(200).pipe(z.email().nullable()),
  address: optText(),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(0),
  notes: optText(2000),
  active: z.boolean().default(true),
});

export const supplierProductsSchema = z.array(
  z.object({
    productId: z.string().min(1),
    supplierCode: optText(50),
    lastPrice: money.nullish().transform((v) => v ?? null),
  }),
);
