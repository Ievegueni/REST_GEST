import { z } from 'zod';
import { FEATURES, PLANS } from '@restgest/shared';

const limit = z.number().int().min(0).nullable().optional();
const limits = {
  maxUnits: limit,
  maxUsers: limit,
  smsMonthlyLimit: limit,
  aiMonthlyLimit: limit,
};

export const adminLoginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

export const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nif: z.string().trim().max(50).nullable().optional(),
  plan: z.enum(PLANS).default('STOCK'),
  ...limits,
  admin: z.object({
    name: z.string().trim().min(1).max(200),
    email: z.email().toLowerCase(),
    password: z.string().min(8).max(200),
    phone: z.string().trim().max(30).nullable().optional(),
  }),
});

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    nif: z.string().trim().max(50).nullable(),
    plan: z.enum(PLANS),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    featureOverrides: z.partialRecord(z.enum(FEATURES), z.boolean()),
    ...limits,
  })
  .partial();

export const impersonateSchema = z.object({ userId: z.string().optional() }).default({});
