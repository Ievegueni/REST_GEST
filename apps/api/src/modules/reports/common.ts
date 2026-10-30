import { z } from 'zod';
import { assertUnitAccess, type AuthContext } from '../../core/auth';
import { env } from '../../core/env';

export type ColType = 'text' | 'int' | 'qty' | 'money' | 'cost' | 'pct' | 'date';
export type Column = { key: string; label: string; type: ColType };
export type Row = Record<string, string | number | null>;
export type Report = {
  title: string;
  columns: Column[];
  rows: Row[];
  totals?: Row;
  notes?: string;
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const filtersSchema = z.object({
  from: day.optional(),
  to: day.optional(),
  unitId: z.string().optional(),
  locationId: z.string().optional(),
  categoryId: z.string().optional(),
  productId: z.string().optional(),
  group: z.string().optional(),
  stagnantOnly: z.enum(['true', 'false']).optional(),
  a: z.coerce.number().min(1).max(99).default(80),
  b: z.coerce.number().min(1).max(100).default(95),
});
export type Filters = z.infer<typeof filtersSchema>;

/** Data de hoje (YYYY-MM-DD) no fuso de apresentação. */
export const todayLocal = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: env.TZ_DISPLAY }).format(now);

/** Instante UTC da meia-noite de `day` no fuso de apresentação. */
export function zonedMidnight(dayStr: string) {
  const guess = new Date(`${dayStr}T00:00:00Z`);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: env.TZ_DISPLAY,
    timeZoneName: 'longOffset',
  })
    .formatToParts(guess)
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT+01:00"
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  const offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return new Date(guess.getTime() - offset * 60_000);
}

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Período [início, fim[ em UTC; por defeito os últimos 30 dias. */
export function period(f: Filters) {
  const to = f.to ?? todayLocal();
  const from = f.from ?? addDays(to, -29);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return {
    from,
    to,
    gte: zonedMidnight(from),
    lt: zonedMidnight(addDays(to, 1)),
    days: Math.max(days, 1),
  };
}

/** Unidades visíveis no relatório (undefined = todas). */
export function scopeUnits(auth: AuthContext, f: Filters): string[] | undefined {
  if (f.unitId) {
    assertUnitAccess(auth, f.unitId);
    return [f.unitId];
  }
  return auth.unitIds === 'all' ? undefined : auth.unitIds;
}

export async function categoryIds(auth: AuthContext, categoryId?: string) {
  if (!categoryId) return undefined;
  const cats = await auth.db.category.findMany({ select: { id: true, parentId: true } });
  const out = [categoryId];
  for (let i = 0; i < out.length; i++)
    out.push(...cats.filter((c) => c.parentId === out[i]).map((c) => c.id));
  return out;
}

/** Filtro comum para movimentos/saldos: unidade, local, categoria, produto. */
export async function scopeWhere(auth: AuthContext, f: Filters) {
  const units = scopeUnits(auth, f);
  const cats = await categoryIds(auth, f.categoryId);
  return {
    location: {
      ...(units && { unitId: { in: units } }),
      ...(f.locationId && { id: f.locationId }),
    },
    product: { ...(cats && { categoryId: { in: cats } }), ...(f.productId && { id: f.productId }) },
  };
}

export const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
