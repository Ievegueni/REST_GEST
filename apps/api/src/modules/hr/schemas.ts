import { z } from 'zod';
import { money, name, optText } from '../../core/schemas';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optDay = day.nullish().transform((v) => (v ? new Date(v) : null));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');

export const departmentSchema = z.object({ name, active: z.boolean().default(true) });
export const positionSchema = z.object({
  name,
  departmentId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  active: z.boolean().default(true),
});

/** Campos gerais (hr.manage). */
export const employeeSchema = z.object({
  number: z.string().trim().min(1).max(30),
  name,
  unitId: z.string().min(1),
  positionId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  userId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  contractType: z.enum(['PERMANENT', 'FIXED_TERM', 'OTHER']).default('PERMANENT'),
  hireDate: day.transform((v) => new Date(v)),
  contractEndDate: optDay,
  terminationDate: optDay,
  phone: optText(30),
  email: optText(200),
  address: optText(500),
  birthDate: optDay,
  vacationDaysPerYear: z.coerce
    .number()
    .int()
    .min(0)
    .max(60)
    .nullish()
    .transform((v) => v ?? null),
  active: z.boolean().default(true),
});

/** Campos sensíveis (hr.sensitive). IBAN: string = definir, null = apagar, omisso = manter. */
export const sensitiveSchema = z.object({
  baseSalary: money.nullish().transform((v) => v ?? null),
  nif: optText(30),
  idNumber: optText(30),
  socialSecurityNo: optText(30),
  bankName: optText(100),
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, 'IBAN inválido'))
    .nullable()
    .optional(),
  allowances: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        amount: money,
        inssSubject: z.boolean().default(true),
        irtExemptUpTo: money.default(0),
      }),
    )
    .max(30)
    .optional(),
});

export const documentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().min(1).max(500),
  expiresAt: optDay,
});

export const shiftsSchema = z.object({
  unitId: z.string().min(1),
  weekStart: day,
  shifts: z
    .array(z.object({ employeeId: z.string().min(1), date: day, start: time, end: time }))
    .max(2000),
});

export const attendanceSchema = z.object({
  date: day,
  records: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        status: z.enum(['PRESENT', 'ABSENT_JUSTIFIED', 'ABSENT_UNJUSTIFIED', 'LEAVE', 'DAY_OFF']),
        checkIn: time.nullish().transform((v) => v ?? null),
        checkOut: time.nullish().transform((v) => v ?? null),
        overtimeMinutes: z.coerce
          .number()
          .int()
          .min(0)
          .max(24 * 60)
          .default(0),
        notes: optText(500),
      }),
    )
    .max(1000),
});

export const leaveSchema = z
  .object({
    employeeId: z.string().min(1),
    type: z.enum([
      'VACATION',
      'SICK',
      'MATERNITY',
      'PATERNITY',
      'BEREAVEMENT',
      'MARRIAGE',
      'OTHER',
    ]),
    startDate: day,
    endDate: day,
    notes: optText(500),
  })
  .refine((l) => l.endDate >= l.startDate, {
    message: 'Data final antes da inicial',
    path: ['endDate'],
  });

export const decideSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']) });
