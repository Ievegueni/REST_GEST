import { Link, useNavigate } from 'react-router-dom';
import { buttonCls, ErrorBox, Inactive, tableCls, tdCls, thCls } from '../../components/ui';
import { useCan, useSession } from '../../features/session';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { SaleItemRow } from './types';

export function SaleItemsPage() {
  const navigate = useNavigate();
  const manage = useCan('recipes.manage');
  const { unitId } = useSession();
  const { data, error } = useApi<SaleItemRow[]>(`/sale-items${unitId ? `?unitId=${unitId}` : ''}`);
  return (
    <div className="space-y-4">
      {manage && (
        <Link to="/fichas/novo" className={buttonCls}>
          {t('recipes.new')}
        </Link>
      )}
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('recipes.code')}</th>
            <th className={thCls}>{t('recipes.name')}</th>
            <th className={`${thCls} text-right`}>{t('recipes.salePrice')}</th>
            <th className={`${thCls} text-right`}>{t('recipes.cost')}</th>
            <th className={`${thCls} text-right`}>{t('recipes.margin')}</th>
            <th className={`${thCls} text-right`}>{t('recipes.marginPct')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((i) => (
            <tr
              key={i.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/fichas/${i.id}`)}
            >
              <td className={`${tdCls} font-mono`}>{i.code}</td>
              <td className={tdCls}>
                {i.name}
                {i.isSubRecipe && (
                  <span className="ml-2 rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
                    {t('recipes.subRecipe')}
                  </span>
                )}
                <Inactive active={i.active} />
                {i.error && <div className="text-xs text-red-700">{i.error}</div>}
              </td>
              <td className={`${tdCls} text-right`}>{formatMoney(i.salePrice)}</td>
              <td className={`${tdCls} text-right`}>
                {formatMoney(i.cost)}
                {i.isSubRecipe && i.yieldUnit && (
                  <span className="text-xs text-slate-500"> /{i.yieldUnit}</span>
                )}
              </td>
              <td className={`${tdCls} text-right`}>{formatMoney(i.margin)}</td>
              <td
                className={`${tdCls} text-right ${i.marginPct != null && i.marginPct < 0 ? 'text-red-700' : ''}`}
              >
                {i.marginPct == null ? '—' : `${i.marginPct}%`}
              </td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={6}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
