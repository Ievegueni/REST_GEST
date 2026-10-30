import type { FeatureOverrides, Plan } from '@restgest/shared';

export type Limits = {
  maxUnits: number | null;
  maxUsers: number | null;
  smsMonthlyLimit: number | null;
  aiMonthlyLimit: number | null;
};

export type TenantRow = Limits & {
  id: string;
  name: string;
  nif: string | null;
  plan: Plan;
  status: 'ACTIVE' | 'SUSPENDED';
  featureOverrides: FeatureOverrides;
  _count: { units: number; users: number };
};

export type TenantDetail = TenantRow & {
  usage: {
    smsSent: number;
    smsCost: number;
    aiRequests: number;
    aiTokens: number;
    aiCostUsd: number;
    salesImports: number;
  };
  users: { id: string; name: string; email: string; active: boolean; role: { name: string } }[];
};

export const LIMIT_KEYS = ['maxUnits', 'maxUsers', 'smsMonthlyLimit', 'aiMonthlyLimit'] as const;
