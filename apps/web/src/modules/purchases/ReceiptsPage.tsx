import { Link, useNavigate } from 'react-router-dom';
import { buttonCls, ErrorBox, tableCls, tdCls, thCls } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { ReceiptRow } from './types';

export function ReceiptsPage() {
  const navigate = useNavigate();
  const { data, error } = useApi<ReceiptRow[]>('/goods-receipts');
  return (
    <div className="space-y-4">
      <Link to="/compras/recepcoes/nova" className={buttonCls}>
        {t('purchases.newReceipt')}
      </Link>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('common.number')}</th>
            <th className={thCls}>{t('common.date')}</th>
            <th className={thCls}>{t('purchases.supplier')}</th>
            <th className={thCls}>{t('purchases.location')}</th>
            <th className={thCls}>{t('purchases.invoiceNumber')}</th>
            <th className={`${thCls} text-right`}>{t('common.total')}</th>
            <th className={thCls}>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((r) => (
            <tr
              key={r.id}
              className={`cursor-pointer hover:bg-slate-50 ${r.status === 'CANCELLED' ? 'text-slate-400' : ''}`}
              onClick={() => navigate(`/compras/recepcoes/${r.id}`)}
            >
              <td className={tdCls}>{r.number}</td>
              <td className={tdCls}>{formatDate(r.receivedAt)}</td>
              <td className={tdCls}>{r.supplier.name}</td>
              <td className={tdCls}>
                {r.location.unit.name} · {r.location.name}
              </td>
              <td className={tdCls}>{r.invoiceNumber}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(r.totalAmount)}</td>
              <td className={tdCls}>{t(`docStatus.${r.status}` as TKey)}</td>
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
