import { inputCls, secondaryCls } from './ui';
import { t } from '../i18n';
import type { ProductRow } from '../modules/types';

export type Line = {
  text: string;
  qty: string;
  unitId: string;
  unitPrice: string;
  lotCode: string;
  expiryDate: string;
  /** ligação opcional a uma linha de documento (ex.: linha da encomenda) */
  refId?: string;
};
export const emptyLine = (over: Partial<Line> = {}): Line => ({
  text: '',
  qty: '',
  unitId: '',
  unitPrice: '',
  lotCode: '',
  expiryDate: '',
  ...over,
});
export const productLabel = (p: { code: string; name: string }) => `${p.code} · ${p.name}`;

/** Encontra o produto pelo texto do campo ("código · nome" ou só o código). */
export function productResolver(products: ProductRow[] | null) {
  const byLabel = new Map(products?.map((p) => [productLabel(p).toLowerCase(), p]));
  const byCode = new Map(products?.map((p) => [p.code.toLowerCase(), p]));
  return (text: string) =>
    byLabel.get(text.trim().toLowerCase()) ?? byCode.get(text.trim().toLowerCase());
}

export function ProductLines(props: {
  products: ProductRow[] | null;
  lines: Line[];
  onChange: (lines: Line[]) => void;
  price?: { label: string; required?: boolean };
  /** mostrar lote/validade para produtos com lote */
  lots?: boolean;
  /** linhas ligadas a um documento não mudam de produto/unidade */
  lockLinked?: boolean;
}) {
  const resolve = productResolver(props.products);
  const set = (i: number, patch: Partial<Line>) =>
    props.onChange(props.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2 rounded border bg-white p-4">
      <datalist id="product-options">
        {props.products?.map((p) => (
          <option key={p.id} value={productLabel(p)} />
        ))}
      </datalist>
      {props.lines.map((l, i) => {
        const p = resolve(l.text);
        const locked = props.lockLinked && !!l.refId;
        const units = p
          ? [
              { id: '', symbol: p.stockUnit.symbol },
              ...(p.conversions ?? []).map((c) => ({ id: c.unitId, symbol: c.unit.symbol })),
            ]
          : [];
        return (
          <div key={i} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="min-w-64 flex-1 space-y-1">
              <span>{t('stock.product')}</span>
              <input
                className={inputCls}
                list="product-options"
                placeholder={t('stock.productPlaceholder')}
                disabled={locked}
                value={l.text}
                onChange={(e) => set(i, { text: e.target.value, unitId: '' })}
              />
            </label>
            <label className="w-28 space-y-1">
              <span>{t('stock.qty')}</span>
              <input
                className={inputCls}
                type="number"
                min={0}
                step="any"
                required={!!l.text}
                value={l.qty}
                onChange={(e) => set(i, { qty: e.target.value })}
              />
            </label>
            <label className="w-24 space-y-1">
              <span>{t('stock.unit')}</span>
              <select
                className={inputCls}
                disabled={locked}
                value={l.unitId}
                onChange={(e) => set(i, { unitId: e.target.value })}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.symbol}
                  </option>
                ))}
              </select>
            </label>
            {props.price && (
              <label className="w-36 space-y-1">
                <span>{props.price.label}</span>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  step={1}
                  required={props.price.required && !!l.text}
                  value={l.unitPrice}
                  onChange={(e) => set(i, { unitPrice: e.target.value })}
                />
              </label>
            )}
            {props.lots && p?.tracksLots && (
              <>
                <label className="w-28 space-y-1">
                  <span>{t('stock.lot')}</span>
                  <input
                    className={inputCls}
                    required
                    value={l.lotCode}
                    onChange={(e) => set(i, { lotCode: e.target.value })}
                  />
                </label>
                <label className="w-40 space-y-1">
                  <span>{t('stock.expiry')}</span>
                  <input
                    className={inputCls}
                    type="date"
                    value={l.expiryDate}
                    onChange={(e) => set(i, { expiryDate: e.target.value })}
                  />
                </label>
              </>
            )}
            {props.lines.length > 1 && (
              <button
                type="button"
                className="pb-2 text-red-600 hover:underline"
                onClick={() => props.onChange(props.lines.filter((_, j) => j !== i))}
              >
                {t('common.remove')}
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className={secondaryCls}
        onClick={() => props.onChange([...props.lines, emptyLine()])}
      >
        {t('stock.addLine')}
      </button>
    </div>
  );
}

/** Converte as linhas do formulário; devolve erro com o texto do produto desconhecido. */
export function resolveLines(products: ProductRow[] | null, lines: Line[]) {
  const resolve = productResolver(products);
  const out = [];
  for (const l of lines.filter((l) => l.text.trim())) {
    const p = resolve(l.text);
    if (!p) return { error: t('stock.unknownProduct', { name: l.text }) };
    out.push({ line: l, product: p, unitId: l.unitId || p.stockUnitId! });
  }
  return { items: out };
}
