import { z } from 'zod';
import { name, optText } from '../../core/schemas';

export const unitSchema = z.object({ name, address: optText(), active: z.boolean().default(true) });

export const locationSchema = z.object({
  name,
  type: z.enum(['WAREHOUSE', 'BAR', 'KITCHEN', 'COLD_ROOM', 'OTHER']).default('OTHER'),
  active: z.boolean().default(true),
});
