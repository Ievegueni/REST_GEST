/** Recibos de vencimento (PDF) e mapa de salários (Excel). */
import type { Report } from '../reports/common';
import { renderPdf, toXlsx } from '../reports/export';
import type { getRun } from './service';

type Run = Awaited<ReturnType<typeof getRun>>;
type Details = {
  paidDays: number;
  overtimeHours: number;
  unjustifiedDays: number;
  allowances: { name: string; amount: number }[];
  deductions: { description: string; amount: number }[];
};

const kz = (v: number) => `${new Intl.NumberFormat('pt-AO').format(v)} Kz`;
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
export const periodLabel = (r: Run) => `${MONTHS[r.month - 1]} de ${r.year}`;

export function payrollMap(r: Run): Report {
  const cols = [
    ['number', 'Nº', 'text'],
    ['name', 'Funcionário', 'text'],
    ['baseSalary', 'Salário base', 'money'],
    ['allowances', 'Subsídios', 'money'],
    ['overtime', 'Horas extra', 'money'],
    ['absenceDeduction', 'Faltas', 'money'],
    ['gross', 'Bruto', 'money'],
    ['inssEmployee', 'INSS trab.', 'money'],
    ['irt', 'IRT', 'money'],
    ['deductions', 'Descontos', 'money'],
    ['net', 'Líquido', 'money'],
    ['inssEmployer', 'INSS emp.', 'money'],
  ] as const;
  const rows = r.lines.map((l) => ({ ...l, number: l.employee.number, name: l.employee.name }));
  const sum = (k: string) =>
    rows.reduce((s, x) => s + Number((x as Record<string, unknown>)[k] ?? 0), 0);
  return {
    title: `Mapa de salários — ${r.unit.name} — ${periodLabel(r)}`,
    columns: cols.map(([key, label, type]) => ({ key, label, type })),
    rows: rows.map((x) =>
      Object.fromEntries(
        cols.map(([k]) => [k, (x as Record<string, unknown>)[k] as string | number]),
      ),
    ),
    totals: { name: 'Total', ...Object.fromEntries(cols.slice(2).map(([k]) => [k, sum(k)])) },
  };
}

export const payrollMapXlsx = (r: Run) => toXlsx(payrollMap(r), `Estado: ${r.status}`);

/** Um recibo por página. */
export function payslipsPdf(
  r: Run,
  tenant: { name: string; nif: string | null; logo?: string | null },
) {
  const content = r.lines.flatMap((l, i) => {
    const d = l.details as unknown as Details;
    const row = (label: string, value: number | null, bold = false) => [
      { text: label, bold },
      { text: value == null ? '' : kz(value), alignment: 'right', bold },
    ];
    const brk = i > 0 ? { pageBreak: 'before' } : {};
    return [
      tenant.logo
        ? { image: tenant.logo, fit: [120, 36], margin: [0, 0, 0, 6], ...brk }
        : { text: '', ...brk },
      { text: tenant.name, bold: true, fontSize: 12 },
      { text: [tenant.nif ? `NIF ${tenant.nif} · ` : '', r.unit.name].join(''), color: '#555555' },
      {
        text: `Recibo de vencimento — ${periodLabel(r)}`,
        fontSize: 13,
        bold: true,
        margin: [0, 12, 0, 6],
      },
      {
        columns: [
          {
            text: [`${l.employee.number} · ${l.employee.name}\n`, l.employee.position?.name ?? ''],
          },
          {
            text: [
              `NIF: ${l.employee.nif ?? '—'}\n`,
              `INSS: ${l.employee.socialSecurityNo ?? '—'}`,
            ],
            alignment: 'right',
          },
        ],
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            row(`Salário base (${d.paidDays} dias)`, l.baseSalary),
            ...d.allowances.map((a) => row(a.name, a.amount)),
            ...(l.overtime ? [row(`Horas extra (${d.overtimeHours} h)`, l.overtime)] : []),
            ...(l.absenceDeduction
              ? [row(`Faltas injustificadas (${d.unjustifiedDays} dias)`, -l.absenceDeduction)]
              : []),
            row('Total bruto', l.gross, true),
            row('INSS do trabalhador', -l.inssEmployee),
            row('IRT', -l.irt),
            ...d.deductions.map((x) => row(x.description, -x.amount)),
            row('Líquido a receber', l.net, true),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: `Base de INSS: ${kz(l.inssBase)} · Matéria colectável IRT: ${kz(l.irtBase)}`,
        margin: [0, 8, 0, 0],
        color: '#555555',
      },
      {
        columns: [
          { text: '\n\n_______________________\nA entidade empregadora' },
          { text: '\n\n_______________________\nO trabalhador', alignment: 'right' },
        ],
        margin: [0, 30, 0, 0],
      },
    ];
  });
  return renderPdf({
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    content,
  });
}
