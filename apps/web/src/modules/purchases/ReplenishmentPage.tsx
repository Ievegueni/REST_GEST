import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buttonCls,
  ErrorBox,
  inputBase,
  inputCls,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useSession } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Supplier, Unit } from '../types';

type Suggestion = {
  productId: string;
  code: string;
  name: string;
  stockUnit: string;
  onHand: number;
  pending: number;
  forecast: number;
  need: number;
  purchaseUnitId: string;
  purchaseUnit: string;
  qty: number;
  supplier: { id: string; name: string } | null;
  lastPrice: number | null;
};
type Line = { selected: boolean; qty: string; supplierId: string; price: string };

export function ReplenishmentPage() {
  const { unitId: sessionUnit } = useSession();
  const { data: units } = useApi<Unit[]>('/units');
  const active = units?.filter((u) => u.active) ?? [];
  const [unitId, setUnitId] = useState('');
  const [coverage, setCoverage] = useState('7');
  const [lookback, setLookback] = useState('28');
  const [query, setQuery] = useState<string | null>(null);
  const unit = unitId || sessionUnit || active[0]?.id || '';
  const { data, error } = useApi<Suggestion[]>(query);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('replenishment.hint')}</p>
      <div className="flex flex-wrap items-end gap-2 rounded border bg-white p-3 text-sm">
        <label className="space-y-1">
          <span>{t('sales.unit')}</span>
          <select className={inputCls} value={unit} onChange={(e) => setUnitId(e.target.value)}>
            {active.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span>{t('replenishment.coverage')}</span>
          <input
            className={`${inputBase} w-24`}
            type="number"
            min={1}
            max={90}
            value={coverage}
            onChange={(e) => setCoverage(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span>{t('replenishment.lookback')}</span>
          <input
            className={`${inputBase} w-24`}
            type="number"
            min={7}
            max={180}
            value={lookback}
            onChange={(e) => setLookback(e.target.value)}
          />
        </label>
        <button
          className={buttonCls}
          disabled={!unit}
          onClick={() =>
            setQuery(
              `/replenishment?unitId=${unit}&coverageDays=${coverage}&lookbackDays=${lookback}&t=${Date.now()}`,
            )
          }
        >
          {t('replenishment.calculate')}
        </button>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {data && <Suggestions key={query} unitId={unit} rows={data} />}
    </div>
  );
}

function Suggestions({ unitId, rows }: { unitId: string; rows: Suggestion[] }) {
  const { data: suppliers } = useApi<Supplier[]>('/suppliers');
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.productId,
        {
          selected: true,
          qty: String(r.qty),
          supplierId: r.supplier?.id ?? '',
          price: r.lastPrice?.toString() ?? '',
        },
      ]),
    ),
  );
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; number: number; supplier: string }[] | null>(
    null,
  );
  const set = (id: string, patch: Partial<Line>) =>
    setLines({ ...lines, [id]: { ...lines[id]!, ...patch } });

  const create = async () => {
    setError('');
    const chosen = rows.filter((r) => lines[r.productId]!.selected);
    if (chosen.some((r) => !lines[r.productId]!.supplierId))
      return setError(t('replenishment.noSupplier'));
    try {
      setCreated(
        await api('/replenishment/orders', {
          body: {
            unitId,
            lines: chosen.map((r) => {
              const l = lines[r.productId]!;
              return {
                productId: r.productId,
                unitId: r.purchaseUnitId,
                qty: Number(l.qty),
                supplierId: l.supplierId,
                unitPrice: l.price === '' ? null : Number(l.price),
              };
            }),
          },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!rows.length) return <p className="text-slate-500">{t('common.empty')}</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead className="bg-slate-100">
            <tr>
              <th className={thCls} />
              <th className={thCls}>{t('stock.product')}</th>
              <th className={`${thCls} text-right`}>{t('replenishment.onHand')}</th>
              <th className={`${thCls} text-right`}>{t('replenishment.pending')}</th>
              <th className={`${thCls} text-right`}>{t('replenishment.forecast')}</th>
              <th className={`${thCls} text-right`}>{t('replenishment.need')}</th>
              <th className={thCls}>{t('replenishment.order')}</th>
              <th className={thCls}>{t('replenishment.supplier')}</th>
              <th className={thCls}>{t('replenishment.price')}</th>
              <th className={`${thCls} text-right`}>{t('replenishment.total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const l = lines[r.productId]!;
              return (
                <tr key={r.productId} className={l.selected ? '' : 'text-slate-400'}>
                  <td className={tdCls}>
                    <input
                      type="checkbox"
                      aria-label={r.name}
                      checked={l.selected}
                      onChange={(e) => set(r.productId, { selected: e.target.checked })}
                    />
                  </td>
                  <td className={tdCls}>
                    {r.code} · {r.name}
                  </td>
                  <td className={`${tdCls} text-right`}>{formatQty(r.onHand)}</td>
                  <td className={`${tdCls} text-right`}>{formatQty(r.pending)}</td>
                  <td className={`${tdCls} text-right`}>{formatQty(r.forecast)}</td>
                  <td className={`${tdCls} text-right whitespace-nowrap`}>
                    {formatQty(r.need)} {r.stockUnit}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    <input
                      aria-label={`${t('replenishment.order')} ${r.name}`}
                      className={`${inputBase} w-20 text-right`}
                      type="number"
                      min={0}
                      step="any"
                      value={l.qty}
                      onChange={(e) => set(r.productId, { qty: e.target.value })}
                    />{' '}
                    {r.purchaseUnit}
                  </td>
                  <td className={tdCls}>
                    <select
                      aria-label={`${t('replenishment.supplier')} ${r.name}`}
                      className={inputCls}
                      value={l.supplierId}
                      onChange={(e) => set(r.productId, { supplierId: e.target.value })}
                    >
                      <option value="">—</option>
                      {suppliers
                        ?.filter((s) => s.active)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <input
                      aria-label={`${t('replenishment.price')} ${r.name}`}
                      className={`${inputBase} w-28 text-right`}
                      type="number"
                      min={0}
                      step={1}
                      value={l.price}
                      onChange={(e) => set(r.productId, { price: e.target.value })}
                    />
                  </td>
                  <td className={`${tdCls} text-right`}>
                    {l.price ? formatMoney(Number(l.qty) * Number(l.price)) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {created ? (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t('replenishment.created', { list: '' })}
          {created.map((o) => (
            <Link key={o.id} to={`/compras/encomendas/${o.id}`} className="ml-2 underline">
              nº {o.number} ({o.supplier})
            </Link>
          ))}
        </p>
      ) : (
        <button className={secondaryCls} onClick={create}>
          {t('replenishment.create')}
        </button>
      )}
    </div>
  );
}
