import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  Boxes,
  CheckCircle2,
  Percent,
  ShoppingCart,
  Store,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AreaChart } from '../../components/AreaChart';
import { ErrorBox, inputBase, PageHeader, Panel, StatCard } from '../../components/ui';
import { useFeature, useSession } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { today } from '../hr/types';

type Figures = {
  revenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPct: number | null;
  cmvPct: number | null;
  waste: number;
  purchases: number;
  opex?: number;
  personnel?: number;
  result?: number;
};
type UnitFigures = Figures & { unitId: string; name: string; stockValue: number };
type Dashboard = {
  period: { from: string; to: string };
  previous: { from: string; to: string };
  finance: boolean;
  total: Figures & { stockValue: number };
  previousTotal: Figures;
  units: UnitFigures[];
  daily: { days: string[]; units: { unitId: string; name: string; revenue: number[] }[] };
  weekSales: {
    from: string;
    to: string;
    units: { unitId: string; name: string; amount: number }[];
  };
  openAlerts: number;
  alerts: { id: string; message: string; createdAt: string }[];
  topItems: { name: string; qty: number; amount: number }[];
  topConsumption: { name: string; value: number }[];
};

const COLORS = ['#4f46e5', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9', '#8b5cf6'];

// ---------- período ----------
type Preset = 'today' | '7d' | 'week' | 'month' | 'lastMonth' | 'custom';
const PRESETS: Exclude<Preset, 'custom'>[] = ['today', '7d', 'week', 'month', 'lastMonth'];
const shift = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
function range(p: Exclude<Preset, 'custom'>, now = today()) {
  if (p === 'today') return { from: now, to: now };
  if (p === '7d') return { from: shift(now, -6), to: now };
  if (p === 'week') {
    const dow = (new Date(`${now}T12:00:00Z`).getUTCDay() + 6) % 7;
    return { from: shift(now, -dow), to: now };
  }
  if (p === 'month') return { from: `${now.slice(0, 8)}01`, to: now };
  const lastPrev = shift(`${now.slice(0, 8)}01`, -1);
  return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
}

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toLocaleString('pt-AO', { maximumFractionDigits: 1 })}%`;
const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Variação vs. período anterior; `good` = subir é bom. */
function Delta({ cur, prev, good = true }: { cur: number; prev: number; good?: boolean }) {
  if (!prev) return <span className="text-gray-400">{t('dash.noPrevious')}</span>;
  const d = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  const ok = d >= 0 === good;
  return (
    <span className={`font-medium ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
      {d >= 0 ? '▲' : '▼'} {Math.abs(d).toLocaleString('pt-AO')}%{' '}
      <span className="font-normal text-gray-500">{t('dash.vsPrevious')}</span>
    </span>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length)
    return <p className="px-5 py-8 text-center text-sm text-gray-500">{t('common.empty')}</p>;
  return (
    <ul className="space-y-3 px-5 py-4 text-sm">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="flex justify-between gap-3">
            <span className="truncate">
              {r.label}
              {r.sub && <span className="ml-1.5 text-xs text-gray-400">{r.sub}</span>}
            </span>
            <span className="font-medium whitespace-nowrap tabular-nums">
              {formatMoney(r.value)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full bg-brand-500"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const { session, unitId } = useSession();
  const stock = useFeature('stock');
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState(range('month'));
  const { from, to } = preset === 'custom' ? custom : range(preset);
  const qs = new URLSearchParams({ from, to, ...(unitId && { unitId }) }).toString();
  const { data, error } = useApi<Dashboard>(stock ? `/dashboard?${qs}` : null);

  const unitName =
    session?.units.find((u) => u.id === unitId)?.name ?? t('units.all').toLowerCase();
  const header = (
    <PageHeader title={t('nav.dashboard')} subtitle={t('dash.subtitle', { unit: unitName })} />
  );
  if (!stock) return header;

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 shadow-xs">
        {[...PRESETS, 'custom' as const].map((p) => (
          <button
            key={p}
            onClick={() => {
              if (p === 'custom') setCustom({ from, to });
              setPreset(p);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              preset === p ? 'bg-brand-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t(`dash.preset.${p}` as TKey)}
          </button>
        ))}
      </div>
      {preset === 'custom' ? (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            aria-label={t('reports.from')}
            className={inputBase}
            value={custom.from}
            max={custom.to}
            onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
          />
          <span className="text-gray-400">–</span>
          <input
            type="date"
            aria-label={t('reports.to')}
            className={inputBase}
            value={custom.to}
            min={custom.from}
            max={today()}
            onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
          />
        </div>
      ) : (
        <span className="text-sm text-gray-500">
          {from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`}
        </span>
      )}
    </div>
  );

  if (!data)
    return (
      <div className="space-y-6">
        {header}
        {filters}
        {error ? (
          <ErrorBox>{error}</ErrorBox>
        ) : (
          <p className="text-gray-500">{t('common.loading')}</p>
        )}
      </div>
    );

  const { total: tot, previousTotal: prev } = data;
  const multi = data.units.length > 1;
  const cols: { key: keyof UnitFigures; label: TKey; pct?: boolean }[] = [
    { key: 'revenue', label: 'dash.revenue' },
    { key: 'grossMargin', label: 'dash.grossMargin' },
    { key: 'cmvPct', label: 'dash.cmvPct', pct: true },
    { key: 'waste', label: 'dash.waste' },
    { key: 'purchases', label: 'dash.purchases' },
    ...(data.finance ? [{ key: 'result' as const, label: 'dash.result' as TKey }] : []),
    { key: 'stockValue', label: 'dash.stockValue' },
  ];
  const cell = (u: Partial<UnitFigures>, c: (typeof cols)[number]) => {
    const v = u[c.key] as number | null | undefined;
    return c.pct ? pct(v) : formatMoney(v ?? 0);
  };

  return (
    <div className="space-y-6">
      {header}
      <div className="-mt-3">{filters}</div>
      <ErrorBox>{error}</ErrorBox>

      {/* indicadores do período */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label={t('dash.revenue')}
          value={formatMoney(tot.revenue)}
          hint={<Delta cur={tot.revenue} prev={prev.revenue} />}
        />
        <StatCard
          icon={Wallet}
          tone="emerald"
          label={t('dash.grossMargin')}
          value={formatMoney(tot.grossMargin)}
          hint={
            <span className="text-gray-500">
              {pct(tot.grossMarginPct)} {t('dash.ofSales')}
            </span>
          }
        />
        <StatCard
          icon={Percent}
          tone="amber"
          label={t('dash.cmvPct')}
          value={pct(tot.cmvPct)}
          hint={<span className="text-gray-500">{formatMoney(tot.cogs + tot.waste)}</span>}
        />
        <StatCard
          icon={Trash2}
          tone="red"
          label={t('dash.waste')}
          value={formatMoney(tot.waste)}
          hint={<Delta cur={tot.waste} prev={prev.waste} good={false} />}
        />
        <StatCard
          icon={ShoppingCart}
          label={t('dash.purchases')}
          value={formatMoney(tot.purchases)}
          hint={<Delta cur={tot.purchases} prev={prev.purchases} good={false} />}
        />
        {data.finance && tot.result != null && (
          <StatCard
            icon={TrendingUp}
            tone={tot.result < 0 ? 'red' : 'emerald'}
            label={t('dash.result')}
            value={formatMoney(tot.result)}
            hint={<Delta cur={tot.result} prev={prev.result ?? 0} />}
          />
        )}
        <Link to="/stock" className="rounded-xl transition hover:-translate-y-0.5">
          <StatCard
            icon={Boxes}
            label={t('dash.stockValue')}
            value={formatMoney(tot.stockValue)}
            hint={<span className="text-gray-500">{t('dash.now')}</span>}
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
      </div>

      {/* vendas diárias por unidade + semana */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          title={multi ? t('dash.dailyByUnit') : t('dash.daily')}
          className="xl:col-span-2"
          action={
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {data.daily.units.map((u, i) => (
                <span key={u.unitId} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {u.name}
                </span>
              ))}
            </div>
          }
        >
          <div className="px-3 pt-4 pb-2">
            {data.daily.days.length > 1 ? (
              <AreaChart
                labels={data.daily.days.map(short)}
                format={formatMoney}
                series={data.daily.units.map((u, i) => ({
                  name: u.name,
                  color: COLORS[i % COLORS.length]!,
                  values: u.revenue,
                }))}
              />
            ) : (
              <p className="px-2 py-12 text-center text-sm text-gray-500">{t('dash.oneDay')}</p>
            )}
          </div>
        </Panel>

        <Panel
          title={t('dashboard.weekSales')}
          action={
            <span className="text-xs text-gray-500">
              {short(data.weekSales.from)} – {short(data.weekSales.to)}
            </span>
          }
        >
          <ul className="divide-y divide-gray-100 text-sm">
            {data.weekSales.units.map((u, i) => (
              <li key={u.unitId} className="flex items-center gap-3 px-5 py-3.5">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: `${COLORS[i % COLORS.length]}1a`,
                    color: COLORS[i % COLORS.length],
                  }}
                >
                  <Store className="size-4.5" strokeWidth={1.75} />
                </span>
                <span className="flex-1 truncate font-medium text-gray-800">{u.name}</span>
                <span className="font-semibold tabular-nums">{formatMoney(u.amount)}</span>
              </li>
            ))}
          </ul>
          {multi && (
            <div className="flex items-center justify-between border-t bg-gray-50 px-5 py-3 text-sm">
              <span className="font-medium text-gray-600">{t('common.total')}</span>
              <span className="text-base font-semibold tabular-nums">
                {formatMoney(data.weekSales.units.reduce((a, u) => a + u.amount, 0))}
              </span>
            </div>
          )}
        </Panel>
      </div>

      {/* comparativo por unidade */}
      <Panel title={t('dash.byUnit')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-5 py-2.5 text-left">{t('hr.unit')}</th>
                {cols.map((c) => (
                  <th key={c.key} className="px-5 py-2.5 text-right whitespace-nowrap">
                    {t(c.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.units.map((u, i) => (
                <tr key={u.unitId} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-medium whitespace-nowrap">
                    <span
                      className="mr-2 inline-block size-2 rounded-full"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    {u.name}
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={`px-5 py-3 text-right whitespace-nowrap tabular-nums ${
                        c.key === 'result' && (u.result ?? 0) < 0 ? 'text-red-600' : ''
                      }`}
                    >
                      {cell(u, c)}
                    </td>
                  ))}
                </tr>
              ))}
              {multi && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-5 py-3">{t('common.total')}</td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-5 py-3 text-right whitespace-nowrap tabular-nums">
                      {cell(tot, c)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* o que mais vende, o que mais consome, alertas */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title={t('dash.topItems')}>
          <Bars
            rows={data.topItems.map((r) => ({
              label: r.name,
              value: r.amount,
              sub: `× ${r.qty.toLocaleString('pt-AO')}`,
            }))}
          />
        </Panel>
        <Panel title={t('dash.topConsumption')}>
          <Bars rows={data.topConsumption.map((r) => ({ label: r.name, value: r.value }))} />
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
    </div>
  );
}
