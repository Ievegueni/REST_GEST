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
