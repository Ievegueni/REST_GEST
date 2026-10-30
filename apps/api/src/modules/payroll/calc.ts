/**
 * Cálculo de salários (funções puras). Todos os valores legais vêm da TaxTable e dos parâmetros
 * do tenant; nada fixo aqui. Valores em AOA inteiros (arredondamento por componente).
 */

export type Bracket = { upTo: number | null; fixed: number; rate: number; excessOver: number };
export type TaxParams = { inssEmployeeRate: number; inssEmployerRate: number; brackets: Bracket[] };
export type PayParams = { weeklyHours: number; overtimeRate: number; monthDays: number };

/** IRT do escalão onde cai a matéria colectável: fixo + (base − excesso) × taxa. */
export function irt(base: number, brackets: Bracket[]) {
  if (base <= 0) return 0;
  const sorted = [...brackets].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  const b = sorted.find((x) => x.upTo == null || base <= x.upTo);
  if (!b) return 0;
  return Math.round(b.fixed + Math.max(0, base - b.excessOver) * (b.rate / 100));
}

export type LineInput = {
  baseSalary: number;
  /** dias do mês em que esteve contratado (proporcionalidade para entradas/saídas) */
  paidDays: number;
  allowances: { name: string; amount: number; inssSubject: boolean; irtExemptUpTo: number }[];
  overtimeHours: number;
  unjustifiedDays: number;
  deductions: { id: string; description: string; installmentAmount: number; remaining: number }[];
};

export function computeLine(i: LineInput, p: PayParams, t: TaxParams) {
  const base =
    i.paidDays >= p.monthDays
      ? i.baseSalary
      : Math.round((i.baseSalary * i.paidDays) / p.monthDays);
  const hourly = (i.baseSalary * 12) / (52 * p.weeklyHours);
  const overtime = Math.round(i.overtimeHours * hourly * p.overtimeRate);
  const absenceDeduction = Math.round((i.unjustifiedDays * i.baseSalary) / p.monthDays);
  const allowances = i.allowances.reduce((s, a) => s + a.amount, 0);
  const gross = Math.max(0, base + allowances + overtime - absenceDeduction);

  const inssBase = Math.max(
    0,
    base +
      overtime -
      absenceDeduction +
      i.allowances.filter((a) => a.inssSubject).reduce((s, a) => s + a.amount, 0),
  );
  const inssEmployee = Math.round((inssBase * t.inssEmployeeRate) / 100);
  const inssEmployer = Math.round((inssBase * t.inssEmployerRate) / 100);
  const exempt = i.allowances.reduce((s, a) => s + Math.min(a.amount, a.irtExemptUpTo), 0);
  const irtBase = Math.max(0, gross - inssEmployee - exempt);
  const irtValue = irt(irtBase, t.brackets);

  // Descontos em prestações, sem deixar o líquido negativo.
  let available = gross - inssEmployee - irtValue;
  const applied: { id: string; description: string; amount: number }[] = [];
  for (const d of i.deductions) {
    const amount = Math.max(0, Math.min(d.installmentAmount, d.remaining, available));
    if (amount > 0) applied.push({ id: d.id, description: d.description, amount });
    available -= amount;
  }
  const deductions = applied.reduce((s, d) => s + d.amount, 0);

  return {
    baseSalary: base,
    allowances,
    overtime,
    absenceDeduction,
    gross,
    inssBase,
    inssEmployee,
    inssEmployer,
    irtBase,
    irt: irtValue,
    deductions,
    net: gross - inssEmployee - irtValue - deductions,
    applied,
  };
}
