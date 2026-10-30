import { Link } from 'react-router-dom';
import { ErrorBox, tableCls, tdCls } from '../../components/ui';
import { useFeature, useSession } from '../../features/session';
import { t } from '../../i18n';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Dashboard = {
  stockValue: number;
  openAlerts: number;
  alerts: { id: string; message: string; createdAt: string }[];
  consumptionMonth: number;
  wasteMonth: number;
  purchasesMonth: number;
  topConsumption: { productId: string; name: string; value: number }[];
  inventories: {
    id: string;
    number: number;
    closedAt: string;
    location: string;
    variance: number;
  }[];
};

function Tile({ label, value, to }: { label: string; value: string; to?: string }) {
  const body = (
    <div className="rounded border bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function DashboardPage() {
  const { unitId } = useSession();
  const stock = useFeature('stock');
  const { data, error } = useApi<Dashboard>(
    stock ? `/dashboard${unitId ? `?unitId=${unitId}` : ''}` : null,
  );
  if (!stock) return <h1 className="text-xl font-semibold">{t('nav.dashboard')}</h1>;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-slate-500">{t('common.loading')}</p>;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('nav.dashboard')}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label={t('dashboard.stockValue')} value={formatMoney(data.stockValue)} to="/stock" />
        <Tile label={t('dashboard.openAlerts')} value={String(data.openAlerts)} to="/alertas" />
        <Tile label={t('dashboard.consumptionMonth')} value={formatMoney(data.consumptionMonth)} />
        <Tile label={t('dashboard.wasteMonth')} value={formatMoney(data.wasteMonth)} />
        <Tile label={t('dashboard.purchasesMonth')} value={formatMoney(data.purchasesMonth)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section>
          <h2 className="mb-2 font-medium">{t('dashboard.topConsumption')}</h2>
          <table className={tableCls}>
            <tbody className="divide-y">
              {data.topConsumption.map((p) => (
                <tr key={p.productId}>
                  <td className={tdCls}>{p.name}</td>
                  <td className={`${tdCls} text-right`}>{formatMoney(p.value)}</td>
                </tr>
              ))}
              {!data.topConsumption.length && (
                <tr>
                  <td className={`${tdCls} text-slate-500`}>{t('common.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="mb-2 font-medium">{t('dashboard.lastAlerts')}</h2>
          <ul className="divide-y rounded border bg-white text-sm">
            {data.alerts.map((a) => (
              <li key={a.id} className="px-3 py-2">
                {a.message}
                <div className="text-xs text-slate-400">{formatDateTime(a.createdAt)}</div>
              </li>
            ))}
            {!data.alerts.length && (
              <li className="px-3 py-2 text-slate-500">{t('alerts.none')}</li>
            )}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-medium">{t('dashboard.inventories')}</h2>
          <table className={tableCls}>
            <tbody className="divide-y">
              {data.inventories.map((c) => (
                <tr key={c.id}>
                  <td className={tdCls}>
                    <Link to={`/stock/inventarios/${c.id}`} className="hover:underline">
                      nº {c.number} · {c.location}
                    </Link>
                    <div className="text-xs text-slate-400">{formatDate(c.closedAt)}</div>
                  </td>
                  <td className={`${tdCls} text-right ${c.variance < 0 ? 'text-red-700' : ''}`}>
                    {formatMoney(c.variance)}
                  </td>
                </tr>
              ))}
              {!data.inventories.length && (
                <tr>
                  <td className={`${tdCls} text-slate-500`}>{t('common.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
