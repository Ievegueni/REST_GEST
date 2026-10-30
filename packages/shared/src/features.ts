export const PLANS = ['STOCK', 'COMPLETO'] as const;
export type Plan = (typeof PLANS)[number];

export const FEATURES = [
  'stock',
  'purchases',
  'recipes',
  'sales_import',
  'alerts_sms',
  'reports_stock',
  'hr',
  'payroll',
  'daily_costs',
  'cash_closing',
  'payables',
  'financial_results',
  'ai_analyzer',
] as const;
export type Feature = (typeof FEATURES)[number];

export type FeatureOverrides = Partial<Record<Feature, boolean>>;

const STOCK_FEATURES: readonly Feature[] = [
  'stock',
  'purchases',
  'recipes',
  'sales_import',
  'alerts_sms',
  'reports_stock',
];

export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  STOCK: STOCK_FEATURES,
  COMPLETO: FEATURES,
};

/** Features efectivas = mapa do plano + overrides. */
export function effectiveFeatures(plan: Plan, overrides: FeatureOverrides = {}): Set<Feature> {
  const set = new Set<Feature>(PLAN_FEATURES[plan]);
  for (const [f, on] of Object.entries(overrides) as [Feature, boolean][]) {
    if (!FEATURES.includes(f)) continue;
    if (on) set.add(f);
    else set.delete(f);
  }
  return set;
}
