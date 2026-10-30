const nf = new Intl.NumberFormat('pt-AO');
const qf = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 3 });

/** AOA (inteiro) → "12 000 Kz" */
export const formatMoney = (v: number | null | undefined) =>
  v == null ? '—' : `${nf.format(v)} Kz`;
export const formatQty = (v: string | number | null | undefined) =>
  v == null || v === '' ? '—' : qf.format(Number(v));
