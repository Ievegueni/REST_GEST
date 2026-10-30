import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBox, inputCls, tableCls, tdCls, thCls } from '../../components/ui';
import { t } from '../../i18n';
import { formatCost, formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { categoryTree, type BalanceRow, type Category } from '../types';
import { useLocations } from './useLocations';

export function BalancesPage() {
  const navigate = useNavigate();
  const { locations, unitId } = useLocations();
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [belowMin, setBelowMin] = useState(false);
  const { data: cats } = useApi<Category[]>('/categories');

  const loc = locations.some((l) => l.id === locationId) ? locationId : '';
  const qs = new URLSearchParams({
    ...(unitId && { unitId }),
    ...(loc && { locationId: loc }),
    ...(search && { search }),
    ...(categoryId && { categoryId }),
    ...(belowMin && { belowMin: 'true' }),
  });
  const { data, error } = useApi<BalanceRow[]>(`/stock/balances?${qs}`);
  const total = data?.reduce((s, r) => s + r.value, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('stock.location')}
          className={`${inputCls} max-w-xs`}
          value={loc}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">{t('stock.allLocations')}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          aria-label={t('product.category')}
          className={`${inputCls} max-w-xs`}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">
            {t('product.category')}: {t('common.all')}
          </option>
          {categoryTree(cats ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </select>
        <input
          className={`${inputCls} max-w-xs`}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={belowMin}
            onChange={(e) => setBelowMin(e.target.checked)}
          />
          {t('stock.belowMin')}
        </label>
        <span className="ml-auto text-sm font-medium">
          {t('stock.totalValue', { value: formatMoney(total) })}
        </span>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('product.code')}</th>
            <th className={thCls}>{t('stock.product')}</th>
            <th className={thCls}>{t('stock.location')}</th>
            <th className={`${thCls} text-right`}>{t('stock.qty')}</th>
            <th className={`${thCls} text-right`}>{t('stock.min')}</th>
            <th className={`${thCls} text-right`}>{t('stock.avgCost')}</th>
            <th className={`${thCls} text-right`}>{t('stock.value')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((r) => (
            <tr
              key={`${r.product.id}-${r.location.id}`}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/stock/produto/${r.product.id}?local=${r.location.id}`)}
            >
              <td className={`${tdCls} font-mono`}>{r.product.code}</td>
              <td className={tdCls}>{r.product.name}</td>
              <td className={tdCls}>
                {r.location.unit.name} · {r.location.name}
              </td>
              <td
                className={`${tdCls} text-right ${Number(r.qty) < 0 ? 'text-red-700' : r.belowMin ? 'text-amber-700' : ''}`}
              >
                {formatQty(r.qty)} {r.product.stockUnit.symbol}
              </td>
              <td className={`${tdCls} text-right text-slate-500`}>{formatQty(r.minQty)}</td>
              <td className={`${tdCls} text-right`}>{formatCost(r.avgCost)}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(r.value)}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={7}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
