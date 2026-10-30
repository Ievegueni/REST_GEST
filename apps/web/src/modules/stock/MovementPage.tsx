import { useState, type FormEvent } from 'react';
import { buttonCls, ErrorBox, inputCls, secondaryCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { ProductRow } from '../types';
import { useLocations } from './useLocations';

const MOVE_TYPES = ['PURCHASE_IN', 'CONSUMPTION', 'WASTE'] as const;
const ADJUST_TYPES = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const;
type Type = (typeof MOVE_TYPES)[number] | (typeof ADJUST_TYPES)[number];
const INBOUND: Type[] = ['PURCHASE_IN', 'ADJUSTMENT_IN'];
const NEEDS_REASON: Type[] = ['WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'];

type Line = {
  text: string;
  qty: string;
  unitId: string;
  unitCost: string;
  lotCode: string;
  expiryDate: string;
};
const emptyLine = (): Line => ({
  text: '',
  qty: '',
  unitId: '',
  unitCost: '',
  lotCode: '',
  expiryDate: '',
});

/** datetime-local no fuso do browser */
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const label = (p: ProductRow) => `${p.code} · ${p.name}`;

export function MovementPage() {
  const canAdjust = useCan('stock.adjust');
  const { locations } = useLocations();
  const { data: products } = useApi<ProductRow[]>('/products?active=true');
  const [locationId, setLocationId] = useState('');
  const [type, setType] = useState<Type>('PURCHASE_IN');
  const [occurredAt, setOccurredAt] = useState(nowLocal);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const byLabel = new Map(products?.map((p) => [label(p).toLowerCase(), p]));
  const byCode = new Map(products?.map((p) => [p.code.toLowerCase(), p]));
  const resolve = (text: string) =>
    byLabel.get(text.trim().toLowerCase()) ?? byCode.get(text.trim().toLowerCase());
  const inbound = INBOUND.includes(type);
  const loc = locations.some((l) => l.id === locationId) ? locationId : (locations[0]?.id ?? '');
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    const items = [];
    for (const l of lines.filter((l) => l.text.trim())) {
      const p = resolve(l.text);
      if (!p) return setError(t('stock.unknownProduct', { name: l.text }));
      items.push({
        productId: p.id,
        type,
        qty: Number(l.qty),
        unitId: l.unitId || null,
        unitCost: type === 'PURCHASE_IN' || (inbound && l.unitCost) ? Number(l.unitCost) : null,
        lotCode: inbound && l.lotCode ? l.lotCode : null,
        expiryDate: inbound && l.expiryDate ? l.expiryDate : null,
      });
    }
    setBusy(true);
    try {
      const created = await api<unknown[]>('/stock/movements', {
        body: {
          locationId: loc,
          occurredAt: new Date(occurredAt).toISOString(),
          reason: reason || null,
          items,
        },
      });
      setMsg(t('stock.registered', { n: created.length }));
      setLines([emptyLine()]);
      setReason('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-5xl space-y-4">
      <div className="grid gap-3 rounded border bg-white p-4 md:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span>{t('stock.location')}</span>
          <select
            className={inputCls}
            required
            value={loc}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('stock.type')}</span>
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as Type)}
          >
            {[...MOVE_TYPES, ...(canAdjust ? ADJUST_TYPES : [])].map((ty) => (
              <option key={ty} value={ty}>
                {t(`movementType.${ty}` as TKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('stock.date')}</span>
          <input
            className={inputCls}
            type="datetime-local"
            max={nowLocal()}
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{NEEDS_REASON.includes(type) ? t('stock.reasonRequired') : t('stock.reason')}</span>
          <input
            className={inputCls}
            required={NEEDS_REASON.includes(type)}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>

      <datalist id="products">
        {products?.map((p) => (
          <option key={p.id} value={label(p)} />
        ))}
      </datalist>

      <div className="space-y-2 rounded border bg-white p-4">
        {lines.map((l, i) => {
          const p = resolve(l.text);
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
                  list="products"
                  placeholder={t('stock.productPlaceholder')}
                  value={l.text}
                  onChange={(e) => setLine(i, { text: e.target.value, unitId: '' })}
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
                  onChange={(e) => setLine(i, { qty: e.target.value })}
                />
              </label>
              <label className="w-24 space-y-1">
                <span>{t('stock.unit')}</span>
                <select
                  className={inputCls}
                  value={l.unitId}
                  onChange={(e) => setLine(i, { unitId: e.target.value })}
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.symbol}
                    </option>
                  ))}
                </select>
              </label>
              {inbound && (
                <label className="w-36 space-y-1">
                  <span>{t('stock.unitCost')}</span>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step="any"
                    required={type === 'PURCHASE_IN' && !!l.text}
                    value={l.unitCost}
                    onChange={(e) => setLine(i, { unitCost: e.target.value })}
                  />
                </label>
              )}
              {inbound && p?.tracksLots && (
                <>
                  <label className="w-28 space-y-1">
                    <span>{t('stock.lot')}</span>
                    <input
                      className={inputCls}
                      required
                      value={l.lotCode}
                      onChange={(e) => setLine(i, { lotCode: e.target.value })}
                    />
                  </label>
                  <label className="w-40 space-y-1">
                    <span>{t('stock.expiry')}</span>
                    <input
                      className={inputCls}
                      type="date"
                      value={l.expiryDate}
                      onChange={(e) => setLine(i, { expiryDate: e.target.value })}
                    />
                  </label>
                </>
              )}
              {lines.length > 1 && (
                <button
                  type="button"
                  className="pb-2 text-red-600 hover:underline"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
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
          onClick={() => setLines([...lines, emptyLine()])}
        >
          {t('stock.addLine')}
        </button>
      </div>

      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      <button className={buttonCls} disabled={busy || !loc}>
        {t('stock.submit')}
      </button>
    </form>
  );
}
