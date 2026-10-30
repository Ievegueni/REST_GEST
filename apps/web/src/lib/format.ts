const nf = new Intl.NumberFormat('pt-AO');
const qf = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 3 });

/** AOA (inteiro) → "12 000 Kz" */
export const formatMoney = (v: number | null | undefined) =>
  v == null ? '—' : `${nf.format(v)} Kz`;
export const formatQty = (v: string | number | null | undefined) =>
  v == null || v === '' ? '—' : qf.format(Number(v));
const cf = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 });
/** custo unitário (taxa com decimais) */
export const formatCost = (v: string | number | null | undefined) =>
  v == null ? '—' : `${cf.format(Number(v))} Kz`;

/** valor para <input type="datetime-local"> no fuso do browser */
export const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
export const formatDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('pt-AO') : '—';
export const formatDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('pt-AO') : '—';

export type ColType = 'text' | 'int' | 'qty' | 'money' | 'cost' | 'pct' | 'date';
const pf = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 });
/** Formatação das células dos relatórios (igual à do Excel/PDF do servidor). */
export function formatCell(type: ColType, v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  if (typeof v !== 'number') return type === 'date' ? formatDate(v) : v;
  if (type === 'money') return formatMoney(v);
  if (type === 'cost') return formatCost(v);
  if (type === 'pct') return `${pf.format(v)}%`;
  if (type === 'qty') return formatQty(v);
  return nf0.format(v);
}
