/**
 * Detecção de anomalias no backend: z-score do dia face aos N dias anteriores, por unidade,
 * para receita, custo das vendas, quebras, custos operacionais e diferenças de caixa.
 * A IA só explica e prioriza o que aqui é calculado.
 */
import type { AuthContext } from '../../core/auth';
import { addDays } from '../reports/common';
import { dailyCells } from '../financial/service';

export const METRICS = {
  revenue: 'Receita (vendas)',
  cogs: 'Custo das vendas (CMV)',
  waste: 'Quebras',
  opex: 'Custos operacionais',
  cash: 'Diferença de caixa',
} as const;
type Metric = keyof typeof METRICS;

export type Anomaly = {
  unitId: string;
  unit: string;
  metric: Metric;
  label: string;
  date: string;
  value: number;
  mean: number;
  z: number;
};

/** z-score de x face ao histórico; null se o histórico não tem variação ou dados suficientes. */
export function zScore(history: number[], x: number, minDays = 7) {
  if (history.filter((v) => v !== 0).length < minDays) return null;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const sd = Math.sqrt(
    history.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, history.length - 1),
  );
  if (sd === 0) return null;
  return { mean, z: (x - mean) / sd };
}

// ponytail: compara com todos os dias do histórico; por dia da semana quando houver meses de dados
export async function detectAnomalies(
  auth: AuthContext,
  day: string,
  threshold: number,
  lookback = 28,
): Promise<Anomaly[]> {
  const from = addDays(day, -lookback);
  const units = await auth.db.unit.findMany({
    where: { active: true, ...(auth.unitIds !== 'all' && { id: { in: auth.unitIds } }) },
    select: { id: true, name: true },
  });
  const ids = units.map((u) => u.id);
  const [cells, sessions] = await Promise.all([
    dailyCells(auth, from, day, ids),
    auth.db.cashSession.findMany({
      where: {
        unitId: { in: ids },
        businessDate: { gte: new Date(from), lte: new Date(day) },
        difference: { not: null },
      },
      select: { unitId: true, businessDate: true, difference: true },
    }),
  ]);
  const cash = new Map<string, number>();
  for (const s of sessions) {
    const k = `${s.unitId}|${s.businessDate.toISOString().slice(0, 10)}`;
    cash.set(k, (cash.get(k) ?? 0) + Math.abs(s.difference!));
  }
  const value = (unitId: string, d: string, m: Metric) =>
    m === 'cash' ? (cash.get(`${unitId}|${d}`) ?? 0) : (cells.get(`${unitId}|${d}`)?.[m] ?? 0);

  const days = Array.from({ length: lookback }, (_, i) => addDays(from, i));
  const out: Anomaly[] = [];
  for (const u of units) {
    for (const m of Object.keys(METRICS) as Metric[]) {
      const x = value(u.id, day, m);
      const s = zScore(
        days.map((d) => value(u.id, d, m)),
        x,
      );
      if (!s || Math.abs(s.z) < threshold) continue;
      out.push({
        unitId: u.id,
        unit: u.name,
        metric: m,
        label: METRICS[m],
        date: day,
        value: Math.round(x),
        mean: Math.round(s.mean),
        z: Math.round(s.z * 10) / 10,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}
