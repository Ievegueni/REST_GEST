import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ConfirmButton } from '../../components/ConfirmButton';
import { ErrorBox, inputCls, secondaryCls, tableCls, tdCls, thCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatCost, formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Movement, Product } from '../types';
import { useLocations } from './useLocations';

type Page = { items: Movement[]; nextCursor: string | null };

export function KardexPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const { data: product } = useApi<Product>(`/products/${id}`);
  const { locations } = useLocations();
  const locationId = params.get('local') ?? locations[0]?.id ?? '';

  return (
    <div className="space-y-4">
      <Link to="/stock" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {t('stock.kardex')}
          {product && ` · ${product.code} ${product.name}`}
        </h2>
        <select
          aria-label={t('stock.location')}
          className={`${inputCls} max-w-xs`}
          value={locationId}
          onChange={(e) => setParams({ local: e.target.value })}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      {locationId && <KardexTable key={locationId} productId={id!} locationId={locationId} />}
    </div>
  );
}

function KardexTable({ productId, locationId }: { productId: string; locationId: string }) {
  const canReverse = useCan('stock.adjust');
  const base = `/stock/products/${productId}/kardex?locationId=${locationId}`;
  const { data: first, error: loadError, reload } = useApi<Page>(base);
  const [more, setMore] = useState<Page[]>([]);
  const [error, setError] = useState('');

  const items = [...(first?.items ?? []), ...more.flatMap((p) => p.items)];
  const cursor = (more.at(-1) ?? first)?.nextCursor ?? null;

  const loadMore = async () => {
    try {
      const page = await api<Page>(`${base}&cursor=${cursor}`);
      setMore((m) => [...m, page]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const reverse = async (m: Movement) => {
    setError('');
    try {
      await api(`/stock/movements/${m.id}/reverse`, { method: 'POST' });
      setMore([]);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <ErrorBox>{error || loadError}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('stock.date')}</th>
            <th className={thCls}>{t('stock.type')}</th>
            <th className={`${thCls} text-right`}>{t('stock.qty')}</th>
            <th className={`${thCls} text-right`}>{t('stock.unitCost')}</th>
            <th className={`${thCls} text-right`}>{t('stock.total')}</th>
            <th className={`${thCls} text-right`}>{t('stock.balance')}</th>
            <th className={thCls}>{t('stock.lot')}</th>
            <th className={thCls}>{t('stock.reason')}</th>
            <th className={thCls}>{t('stock.user')}</th>
            <th className={thCls} />
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((m) => (
            <tr key={m.id} className={m.reversedBy || m.reversalOfId ? 'text-slate-400' : ''}>
              <td className={tdCls}>{new Date(m.occurredAt).toLocaleString('pt-AO')}</td>
              <td className={tdCls}>
                {t(`movementType.${m.type}` as TKey)}
                {m.reversalOfId && <span className="ml-1 text-xs">({t('stock.reversal')})</span>}
                {m.reversedBy && <span className="ml-1 text-xs">({t('stock.reversed')})</span>}
              </td>
              <td
                className={`${tdCls} text-right ${Number(m.qty) < 0 ? 'text-red-700' : 'text-emerald-700'}`}
              >
                {formatQty(m.qty)}
              </td>
              <td className={`${tdCls} text-right`}>{formatCost(m.unitCost)}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(m.totalCost)}</td>
              <td className={`${tdCls} text-right font-medium`}>{formatQty(m.balanceAfter)}</td>
              <td className={tdCls}>{m.lot?.code}</td>
              <td className={tdCls}>{m.reason}</td>
              <td className={tdCls}>{m.user?.name}</td>
              <td className={tdCls}>
                {canReverse && !m.refType && !m.reversalOfId && !m.reversedBy && (
                  <ConfirmButton
                    className="text-red-600 hover:underline"
                    onConfirm={() => reverse(m)}
                  >
                    {t('stock.reverse')}
                  </ConfirmButton>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={10}>
                {t('stock.noMovements')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {cursor && (
        <button className={secondaryCls} onClick={loadMore}>
          {t('stock.loadMore')}
        </button>
      )}
    </>
  );
}
