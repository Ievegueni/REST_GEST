import { z } from 'zod';

const password = z.string().min(8, 'Mínimo 8 caracteres').max(200);

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});
export const forgotSchema = z.object({ email: z.email().toLowerCase() });
export const resetSchema = z.object({ token: z.string().min(20), password });
