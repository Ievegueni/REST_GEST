import { describe, expect, it } from 'vitest';
import { computeLine, irt, type Bracket } from './calc';

// Valores FICTÍCIOS só para testar a mecânica (não são a tabela legal em vigor).
const BRACKETS: Bracket[] = [
  { upTo: 100_000, fixed: 0, rate: 0, excessOver: 0 },
  { upTo: 200_000, fixed: 1_000, rate: 10, excessOver: 100_000 },
  { upTo: null, fixed: 11_000, rate: 20, excessOver: 200_000 },
];
const TAX = { inssEmployeeRate: 3, inssEmployerRate: 8, brackets: BRACKETS };
const PARAMS = { weeklyHours: 40, overtimeRate: 1.5, monthDays: 30 };

describe('IRT por escalões', () => {
  it('fixo + excesso × taxa no escalão certo', () => {
    expect(irt(80_000, BRACKETS)).toBe(0);
    expect(irt(150_000, BRACKETS)).toBe(6_000); // 1000 + 50000 × 10%
    expect(irt(300_000, BRACKETS)).toBe(31_000); // 11000 + 100000 × 20%
    expect(irt(-5, BRACKETS)).toBe(0);
  });
});

describe('linha de salário', () => {
  const base = {
    baseSalary: 200_000,
    paidDays: 30,
    allowances: [{ name: 'Transporte', amount: 30_000, inssSubject: false, irtExemptUpTo: 20_000 }],
    overtimeHours: 0,
    unjustifiedDays: 0,
    deductions: [],
  };

  it('bruto, INSS só sobre a parte sujeita, IRT com isenção', () => {
    const r = computeLine(base, PARAMS, TAX);
    expect(r.gross).toBe(230_000);
    expect(r.inssBase).toBe(200_000); // transporte não sujeito
    expect(r.inssEmployee).toBe(6_000);
    expect(r.inssEmployer).toBe(16_000);
    expect(r.irtBase).toBe(204_000); // 230000 − 6000 − 20000 isento
    expect(r.irt).toBe(11_800); // 11000 + 4000 × 20%
    expect(r.net).toBe(212_200);
  });

  it('horas extra, faltas injustificadas e proporcionalidade', () => {
    const r = computeLine(
      { ...base, allowances: [], overtimeHours: 4, unjustifiedDays: 3, paidDays: 30 },
      PARAMS,
      TAX,
    );
    // valor/hora = 200000 × 12 / (52 × 40) = 1153,85; extra = 4 × 1153,85 × 1,5
    expect(r.overtime).toBe(6_923);
    expect(r.absenceDeduction).toBe(20_000);
    const half = computeLine({ ...base, allowances: [], paidDays: 15 }, PARAMS, TAX);
    expect(half.baseSalary).toBe(100_000);
  });

  it('descontos em prestações nunca deixam o líquido negativo', () => {
    const r = computeLine(
      {
        ...base,
        allowances: [],
        deductions: [
          { id: 'a', description: 'Adiantamento', installmentAmount: 50_000, remaining: 30_000 },
          { id: 'b', description: 'Outro', installmentAmount: 500_000, remaining: 500_000 },
        ],
      },
      PARAMS,
      TAX,
    );
    expect(r.applied[0]).toMatchObject({ id: 'a', amount: 30_000 }); // limitado ao saldo
    expect(r.net).toBe(0);
    expect(r.deductions).toBe(200_000 - 6_000 - r.irt);
  });
});
