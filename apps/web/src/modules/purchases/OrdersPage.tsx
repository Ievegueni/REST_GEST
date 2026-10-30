import { Link, useNavigate } from 'react-router-dom';
import { buttonCls, ErrorBox, tableCls, tdCls, thCls } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { OrderRow } from './types';

export function OrdersPage() {
  const navigate = useNavigate();
  const { data, error } = useApi<OrderRow[]>('/purchase-orders');
  return (
    <div className="space-y-4">
      <Link to="/compras/encomendas/nova" className={buttonCls}>
        {t('purchases.newOrder')}
      </Link>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('common.number')}</th>
            <th className={thCls}>{t('purchases.supplier')}</th>
            <th className={thCls}>{t('purchases.unit')}</th>
            <th className={thCls}>{t('common.date')}</th>
            <th className={thCls}>{t('purchases.expectedDate')}</th>
            <th className={thCls}>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((o) => (
            <tr
              key={o.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/compras/encomendas/${o.id}`)}
            >
              <td className={tdCls}>{o.number}</td>
              <td className={tdCls}>{o.supplier.name}</td>
              <td className={tdCls}>{o.unit.name}</td>
              <td className={tdCls}>{formatDate(o.createdAt)}</td>
              <td className={tdCls}>{formatDate(o.expectedDate)}</td>
              <td className={tdCls}>{t(`orderStatus.${o.status}` as TKey)}</td>
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
