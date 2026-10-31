import { Link } from 'react-router-dom';
import { BellRing, Boxes, CheckCircle2, Flame, ShoppingCart, Store, Trash2 } from 'lucide-react';
import { AreaChart } from '../../components/AreaChart';
import { ErrorBox, PageHeader, Panel, StatCard } from '../../components/ui';
import { useFeature, useSession } from '../../features/session';
import { t } from '../../i18n';
import { formatDateTime, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Dashboard = {
  stockValue: number;
  openAlerts: number;
  alerts: { id: string; message: string; createdAt: string }[];
  consumptionMonth: number;
  wasteMonth: number;
  purchasesMonth: number;
  daily: { date: string; consumption: number; waste: number }[];
  topConsumption: { productId: string; name: string; value: number }[];
  weekSales: {
    from: string;
    to: string;
    units: { unitId: string; name: string; amount: number }[];
  };
};

export function DashboardPage() {
  const { session, unitId } = useSession();
  const stock = useFeature('stock');
  const { data, error } = useApi<Dashboard>(
    stock ? `/dashboard${unitId ? `?unitId=${unitId}` : ''}` : null,
  );
  const unitName =
    session?.units.find((u) => u.id === unitId)?.name ?? t('units.all').toLowerCase();
  const header = (
    <PageHeader title={t('nav.dashboard')} subtitle={t('dashboard.subtitle', { unit: unitName })} />
  );
  if (!stock) return header;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-gray-500">{t('common.loading')}</p>;
  const day = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] sm:gap-4">
        <Link to="/stock" className="rounded-xl transition hover:-translate-y-0.5">
          <StatCard
            icon={Boxes}
            label={t('dashboard.stockValue')}
            value={formatMoney(data.stockValue)}
          />
        </Link>
        <Link to="/alertas" className="rounded-xl transition hover:-translate-y-0.5">
          <StatCard
            icon={BellRing}
            tone={data.openAlerts ? 'amber' : 'emerald'}
            label={t('dashboard.openAlerts')}
            value={String(data.openAlerts)}
          />
        </Link>
        <StatCard
          icon={Flame}
          label={t('dashboard.consumptionMonth')}
          value={formatMoney(data.consumptionMonth)}
        />
        <StatCard
          icon={Trash2}
          tone="red"
          label={t('dashboard.wasteMonth')}
          value={formatMoney(data.wasteMonth)}
          hint={
            data.consumptionMonth > 0 && (
              <span className="text-gray-500">
                {t('dashboard.wastePct', {
                  pct: ((data.wasteMonth / data.consumptionMonth) * 100).toLocaleString('pt-AO', {
                    maximumFractionDigits: 1,
                  }),
                })}
              </span>
            )
          }
        />
        <StatCard
          icon={ShoppingCart}
          label={t('dashboard.purchasesMonth')}
          value={formatMoney(data.purchasesMonth)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          title={t('dashboard.chartTitle')}
          className="xl:col-span-2"
          action={
            <div className="flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand-600" />
                {t('dashboard.consumption')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                {t('dashboard.waste')}
              </span>
            </div>
          }
        >
          <div className="px-3 pt-4 pb-2">
            <AreaChart
              labels={data.daily.map((d) => day(d.date))}
              format={formatMoney}
              series={[
                {
                  name: t('dashboard.consumption'),
                  color: '#4f46e5',
                  values: data.daily.map((d) => d.consumption),
                },
                {
                  name: t('dashboard.waste'),
                  color: '#ef4444',
                  values: data.daily.map((d) => d.waste),
                },
              ]}
            />
          </div>
        </Panel>

        <Panel
          title={t('dashboard.lastAlerts')}
          action={
            <Link to="/alertas" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              {t('alerts.seeAll')}
            </Link>
          }
        >
          <ul className="divide-y divide-gray-100 text-sm">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex gap-3 px-5 py-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" />
                <div className="min-w-0">
                  <div className="text-gray-800">{a.message}</div>
                  <div className="text-xs text-gray-400">{formatDateTime(a.createdAt)}</div>
                </div>
              </li>
            ))}
            {!data.alerts.length && (
              <li className="flex flex-col items-center gap-2 px-5 py-10 text-gray-500">
                <CheckCircle2 className="size-8 text-emerald-500" strokeWidth={1.5} />
                {t('alerts.none')}
              </li>
            )}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={t('dashboard.topConsumption')}>
          <ul className="space-y-3 px-5 py-4 text-sm">
            {data.topConsumption.map((p) => (
              <li key={p.productId}>
                <div className="flex justify-between gap-3">
                  <span className="truncate">{p.name}</span>
                  <span className="font-medium tabular-nums">{formatMoney(p.value)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-brand-500"
                    style={{
                      width: `${(p.value / Math.max(1, data.topConsumption[0]!.value)) * 100}%`,
                    }}
                  />
                </div>
              </li>
            ))}
            {!data.topConsumption.length && <li className="text-gray-500">{t('common.empty')}</li>}
          </ul>
        </Panel>

        <Panel
          title={t('dashboard.weekSales')}
          action={
            <span className="text-xs text-gray-500">
              {day(data.weekSales.from)} – {day(data.weekSales.to)}
            </span>
          }
        >
          <ul className="divide-y divide-gray-100 text-sm">
            {data.weekSales.units.map((u) => (
              <li key={u.unitId} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Store className="size-4.5" strokeWidth={1.75} />
                </span>
                <span className="flex-1 truncate font-medium text-gray-800">{u.name}</span>
                <span className="font-semibold tabular-nums">{formatMoney(u.amount)}</span>
              </li>
            ))}
          </ul>
          {data.weekSales.units.length > 1 && (
            <div className="flex items-center justify-between border-t bg-gray-50 px-5 py-3 text-sm">
              <span className="font-medium text-gray-600">{t('common.total')}</span>
              <span className="text-base font-semibold tabular-nums">
                {formatMoney(data.weekSales.units.reduce((a, u) => a + u.amount, 0))}
              </span>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
