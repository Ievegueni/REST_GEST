import { useState, type FormEvent } from 'react';
import { emptyLine, ProductLines, resolveLines, type Line } from '../../components/ProductLines';
import { buttonCls, ErrorBox, inputCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { nowLocal } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { ProductRow } from '../types';
import { useLocations } from './useLocations';

const MOVE_TYPES = ['PURCHASE_IN', 'CONSUMPTION', 'WASTE'] as const;
const ADJUST_TYPES = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const;
type Type = (typeof MOVE_TYPES)[number] | (typeof ADJUST_TYPES)[number];
const INBOUND: Type[] = ['PURCHASE_IN', 'ADJUSTMENT_IN'];
const NEEDS_REASON: Type[] = ['WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'];

export function MovementPage() {
  const canAdjust = useCan('stock.adjust');
  const { locations } = useLocations();
  const { data: products } = useApi<ProductRow[]>('/products?active=true');
  const { data: reasons } = useApi<{ name: string; active: boolean }[]>('/waste-reasons');
  const wasteReasons = reasons?.filter((r) => r.active) ?? [];
  const [locationId, setLocationId] = useState('');
  const [type, setType] = useState<Type>('PURCHASE_IN');
  const [occurredAt, setOccurredAt] = useState(nowLocal);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const inbound = INBOUND.includes(type);
  const loc = locations.some((l) => l.id === locationId) ? locationId : (locations[0]?.id ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    const r = resolveLines(products, lines);
    if (r.error) return setError(r.error);
    setBusy(true);
    try {
      const created = await api<unknown[]>('/stock/movements', {
        body: {
          locationId: loc,
          occurredAt: new Date(occurredAt).toISOString(),
          reason: reason || null,
          items: r.items!.map(({ line, product, unitId }) => ({
            productId: product.id,
            type,
            qty: Number(line.qty),
            unitId,
            unitCost: inbound && line.unitPrice ? Number(line.unitPrice) : null,
            lotCode: inbound && line.lotCode ? line.lotCode : null,
            expiryDate: inbound && line.expiryDate ? line.expiryDate : null,
          })),
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
      <div className="grid gap-3 rounded-xl border bg-white shadow-xs p-4 md:grid-cols-4">
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
          {type === 'WASTE' && wasteReasons.length ? (
            <select
              className={inputCls}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">—</option>
              {wasteReasons.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              required={NEEDS_REASON.includes(type)}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </label>
      </div>
      <ProductLines
        products={products}
        lines={lines}
        onChange={setLines}
        price={
          inbound ? { label: t('stock.unitCost'), required: type === 'PURCHASE_IN' } : undefined
        }
        lots={inbound}
      />
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      <button className={buttonCls} disabled={busy || !loc}>
        {t('stock.submit')}
      </button>
    </form>
  );
}
