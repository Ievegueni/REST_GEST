import { Link, useNavigate } from 'react-router-dom';
import { buttonCls, ErrorBox, tableCls, tdCls, thCls } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Row = {
  id: string;
  number: number;
  status: string;
  createdAt: string;
  fromLocation: { name: string; unit: { name: string } };
  toLocation: { name: string; unit: { name: string } };
  _count: { lines: number };
};

export function TransfersPage() {
  const navigate = useNavigate();
  const { data, error } = useApi<Row[]>('/transfers');
  return (
    <div className="space-y-4">
      <Link to="/stock/transferencias/nova" className={buttonCls}>
        {t('transfers.new')}
      </Link>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('common.number')}</th>
            <th className={thCls}>{t('common.date')}</th>
            <th className={thCls}>{t('transfers.from')}</th>
            <th className={thCls}>{t('transfers.to')}</th>
            <th className={thCls}>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/stock/transferencias/${r.id}`)}
            >
              <td className={tdCls}>{r.number}</td>
              <td className={tdCls}>{formatDate(r.createdAt)}</td>
              <td className={tdCls}>
                {r.fromLocation.unit.name} · {r.fromLocation.name}
              </td>
              <td className={tdCls}>
                {r.toLocation.unit.name} · {r.toLocation.name}
              </td>
              <td className={tdCls}>{t(`transferStatus.${r.status}` as TKey)}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={5}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
