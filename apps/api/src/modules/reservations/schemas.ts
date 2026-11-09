import { z } from 'zod';
import { name, optText } from '../../core/schemas';

const optId = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

export const tableSchema = z.object({
  unitId: z.string().min(1),
  name: z.string().trim().min(1).max(50),
  seats: z.coerce.number().int().min(1).max(100),
  area: optText(100),
  active: z.boolean().default(true),
});

/** Várias mesas numeradas de uma vez (ex.: 101 a 120 na área Lounge). */
export const tableRangeSchema = z
  .object({
    unitId: z.string().min(1),
    from: z.coerce.number().int().min(0),
    to: z.coerce.number().int().min(0),
    seats: z.coerce.number().int().min(1).max(100),
    area: optText(100),
  })
  .refine((v) => v.to >= v.from && v.to - v.from < 200, 'Intervalo inválido (máx. 200 mesas)');

export const reservationSchema = z.object({
  unitId: z.string().min(1),
  tableId: optId,
  customerName: name,
  phone: optText(30),
  partySize: z.coerce.number().int().min(1).max(500),
  startsAt: z.coerce.date(),
  notes: optText(500),
  /** cliente sem reserva: fica logo sentado (exige mesa) */
  walkIn: z.boolean().default(false),
});

export const reservationPatch = reservationSchema
  .omit({ unitId: true, walkIn: true })
  .partial()
  .extend({ status: z.enum(['BOOKED', 'SEATED', 'DONE', 'CANCELLED', 'NO_SHOW']).optional() });

export const boardQuery = z.object({
  unitId: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
