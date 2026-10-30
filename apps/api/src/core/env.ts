import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLOUDINARY_URL: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  FUTURIX_SMS_API_URL: z.string().default('https://sms-api.futurix.ao'),
  FUTURIX_SMS_API_KEY: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  FUTURIX_SMS_SENDER: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  TZ_DISPLAY: z.string().default('Africa/Luanda'),
  ENCRYPTION_KEY: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  RUN_WORKERS: z.enum(['true', 'false']).default('true'),
  APP_URL: z.string().default('http://localhost:5173'),
});

export const env = schema.parse(process.env);
