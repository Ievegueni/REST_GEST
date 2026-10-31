import { Link } from 'react-router-dom';
import {
  Building2,
  CircleDollarSign,
  FileSpreadsheet,
  MessageSquareText,
  Sparkles,
  Store,
} from 'lucide-react';
import { AreaChart } from '../../components/AreaChart';
import { buttonCls, ErrorBox, PageHeader, Panel, StatCard } from '../../components/ui';
import { t } from '../../i18n';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { PlanBadge, StatusBadge } from './badges';

type Dashboard = {
  tenants: { total: number; active: number; suspended: number; completo: number; stock: number };
  units: number;
  users: number;
  month: {
    smsSent: number;
    smsCost: number;
    aiRequests: number;
    aiCostUsd: number;
    salesImports: number;
  };
  daily: { days: string[]; ai: number[]; sms: number[]; imports: number[] };
  recent: {
    id: string;
    name: string;
    plan: string;
    status: string;
    createdAt: string;
    _count: { units: number; users: number };
  }[];
  topAi: { tenantId: string; name: string; requests: number; costUsd: number }[];
};

const usd = (v: number) =>
  `${v.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

export function AdminDashboardPage() {
  const { data, error } = useApi<Dashboard>('/admin/dashboard');
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-gray-500">{t('common.loading')}</p>;
  const { tenants, month, daily } = data;
  const completoPct = tenants.total ? Math.round((tenants.completo / tenants.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('adminDash.title')} subtitle={t('adminDash.subtitle')}>
        <Link to="/admin/tenants/novo" className={buttonCls}>
          {t('admin.newTenant')}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] sm:gap-4">
        <StatCard
          icon={Building2}
          label={t('adminDash.activeTenants')}
          value={String(tenants.active)}
          hint={
            tenants.suspended > 0 && (
              <span className="text-red-600">
                {t('adminDash.suspended', { n: tenants.suspended })}
              </span>
            )
          }
        />
        <StatCard
          icon={Sparkles}
          label={t('adminDash.completo')}
          value={`${tenants.completo} / ${tenants.total}`}
          hint={<span className="text-gray-500">{completoPct}%</span>}
        />
        <StatCard
          icon={Store}
          tone="emerald"
          label={t('adminDash.unitsUsers')}
          value={`${data.units} · ${data.users}`}
        />
        <StatCard
          icon={MessageSquareText}
          tone="amber"
          label={t('adminDash.sms')}
          value={String(month.smsSent)}
          hint={<span className="text-gray-500">{formatMoney(month.smsCost)}</span>}
        />
        <StatCard
          icon={CircleDollarSign}
          label={t('adminDash.ai')}
          value={String(month.aiRequests)}
          hint={<span className="text-gray-500">{usd(month.aiCostUsd)}</span>}
        />
        <StatCard
          icon={FileSpreadsheet}
          tone="emerald"
          label={t('adminDash.imports')}
          value={String(month.salesImports)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          title={t('adminDash.activity')}
          className="xl:col-span-2"
          action={
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {(
                [
                  ['#4f46e5', 'adminDash.series.ai'],
                  ['#f59e0b', 'adminDash.series.sms'],
                  ['#10b981', 'adminDash.series.imports'],
                ] as const
              ).map(([c, k]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: c }} />
                  {t(k)}
                </span>
              ))}
            </div>
          }
        >
          <div className="px-3 pt-4 pb-2">
            <AreaChart
              integer
              labels={daily.days.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)}
              series={[
                { name: t('adminDash.series.ai'), color: '#4f46e5', values: daily.ai },
                { name: t('adminDash.series.sms'), color: '#f59e0b', values: daily.sms },
                { name: t('adminDash.series.imports'), color: '#10b981', values: daily.imports },
              ]}
            />
          </div>
        </Panel>

        <Panel title={t('adminDash.topAi')}>
          <ul className="divide-y divide-gray-100 text-sm">
            {data.topAi.map((r) => (
              <li key={r.tenantId} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link
                  to={`/admin/tenants/${r.tenantId}`}
                  className="truncate font-medium hover:text-brand-600"
                >
                  {r.name}
                </Link>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{r.requests}</div>
                  <div className="text-xs text-gray-500">{usd(r.costUsd)}</div>
                </div>
              </li>
            ))}
            {!data.topAi.length && (
              <li className="px-5 py-10 text-center text-gray-500">{t('adminDash.noAi')}</li>
            )}
          </ul>
        </Panel>
      </div>

      <Panel
        title={t('adminDash.recent')}
        action={
          <Link
            to="/admin/tenants"
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            {t('adminDash.seeAll')}
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-5 py-2.5 text-left">{t('admin.name')}</th>
                <th className="px-5 py-2.5 text-left">{t('admin.plan')}</th>
                <th className="px-5 py-2.5 text-left">{t('admin.status')}</th>
                <th className="px-5 py-2.5 text-right">{t('admin.units')}</th>
                <th className="px-5 py-2.5 text-right">{t('admin.users')}</th>
                <th className="px-5 py-2.5 text-left">{t('adminDash.createdAt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.recent.map((tn) => (
                <tr key={tn.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3">
                    <Link
                      to={`/admin/tenants/${tn.id}`}
                      className="font-medium hover:text-brand-600"
                    >
                      {tn.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <PlanBadge plan={tn.plan} />
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={tn.status} />
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{tn._count.units}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{tn._count.users}</td>
                  <td className="px-5 py-3 text-gray-500">{formatDate(tn.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
