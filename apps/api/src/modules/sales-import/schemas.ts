import { z } from 'zod';
import { name, optText } from '../../core/schemas';

const header = z
  .string()
  .trim()
  .max(100)
  .nullish()
  .transform((v) => v || undefined);

export const profileSchema = z.object({
  name,
  posName: z.string().trim().min(1).max(50),
  sheetName: optText(100),
  headerRow: z.coerce.number().int().min(1).max(100).default(1),
  columns: z.object({
    itemCode: z.string().trim().min(1).max(100),
    itemName: header,
    qty: z.string().trim().min(1).max(100),
    amount: header,
    date: header,
  }),
  dateFormat: z.enum(['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']).default('DD/MM/YYYY'),
  decimalSeparator: z.enum([',', '.']).default(','),
  active: z.boolean().default(true),
});

export const uploadFields = z.object({
  unitId: z.string().min(1),
  profileId: z.string().min(1),
  saleDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const mappingSchema = z.object({
  posName: z.string().min(1),
  posCode: z.string().min(1),
  posLabel: optText(200),
  saleItemId: z.string().min(1).nullable(),
  ignore: z.boolean().default(false),
});
