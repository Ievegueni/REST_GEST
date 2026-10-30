import { z } from 'zod';
import { name, optText } from '../../core/schemas';

const base = {
  name,
  phone: optText(30),
  roleId: z.string().min(1),
  allUnits: z.boolean().default(false),
  unitIds: z.array(z.string().min(1)).default([]),
  active: z.boolean().default(true),
};

export const createUserSchema = z.object({
  ...base,
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(200),
});

export const updateUserSchema = z
  .object({ ...base, password: z.string().min(8).max(200) })
  .partial();
