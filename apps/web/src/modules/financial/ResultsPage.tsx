import { useState } from 'react';
import {
  Banknote,
  FileSpreadsheet,
  FileText,
  Percent,
  ReceiptText,
  Scale,
  Trash2,
  TrendingUp,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { AreaChart } from '../../components/AreaChart';
import {
  ErrorBox,
  inputCls,
  Panel,
  secondaryCls,
  StatCard,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useSession } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { apiDownload } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { today } from '../hr/types';

type M = {
  revenue: number;
  cogs: number;
  waste: number;
  opex: number;
  personnel: number;
  result: number;
  cmvPct: number | null;
  personnelPct: number | null;
  breakEven: number | null;
};
type Summary = {
  from: string;
  to: string;
  total: M;
  previous: M & { from: string; to: string };
  units: (M & { unitId: string; name: string })[];
  daily: (M & { date: string })[];
};

const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-AO')}%`);
const delta = (cur: number, prev: number) =>
  prev ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null;

function Kpi({
  label,
  value,
  change,
  good,
  icon,
  tone,
}: {
  label: string;
  value: string;
  change?: number | null;
  good?: boolean;
  icon: LucideIcon;
  tone?: 'brand' | 'red' | 'amber' | 'emerald';
}) {
  return (
    <StatCard
      icon={icon}
      tone={tone}
      label={label}
      value={value}
      hint={
        change != null && (
          <span
            className={`font-medium ${change >= 0 === (good ?? true) ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {change >= 0 ? '▲' : '▼'} {Math.abs(change).toLocaleString('pt-AO')}%{' '}
            <span className="font-normal text-gray-500">{t('results.vsPrevious')}</span>
          </span>
        )
      }
    />
  );
}

export function ResultsPage() {
  const { unitId } = useSession();
  const now = today();
  const [from, setFrom] = useState(`${now.slice(0, 7)}-01`);
  const [to, setTo] = useState(now);
  const qs = new URLSearchParams({ from, to, ...(unitId && { unitId }) }).toString();
  const { data, error } = useApi<Summary>(`/financial/summary?${qs}`);
  const [err, setErr] = useState('');
  const download = (group: 'day' | 'month' | 'unit', format: 'xlsx' | 'pdf') =>
    apiDownload(
      `/reports/financial-results?${qs}&group=${group}&format=${format}`,
      `resultados-${group}.${format}`,
    ).catch((e: Error) => setErr(e.message));

  // todos os dias do período (dias sem movimento = 0)
  const byDay = new Map((data?.daily ?? []).map((d) => [d.date, d]));
  const days: string[] = [];
  if (data)
    for (let d = data.from; d <= data.to && days.length < 400;) {
      days.push(d);
      const x = new Date(`${d}T00:00:00Z`);
      x.setUTCDate(x.getUTCDate() + 1);
      d = x.toISOString().slice(0, 10);
    }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.results')}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t('results.subtitle')}</p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">{t('reports.from')}</span>
          <input
            className={inputCls}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">{t('reports.to')}</span>
          <input
            className={inputCls}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div className="flex">
          <span className="inline-flex items-center gap-1.5 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-600">
            <FileSpreadsheet className="size-4 text-emerald-600" /> Excel
          </span>
          {(['day', 'month', 'unit'] as const).map((g, i) => (
            <button
              key={g}
              className={`border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 ${i ? 'border-l-0' : ''} ${g === 'unit' ? 'rounded-r-lg' : ''}`}
              onClick={() => download(g, 'xlsx')}
            >
              {t(`results.group.${g}`)}
            </button>
          ))}
        </div>
        <button className={secondaryCls} onClick={() => download('month', 'pdf')}>
          <FileText className="size-4 text-red-500" />
          PDF
        </button>
      </div>
      <ErrorBox>{err || error}</ErrorBox>
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={Banknote}
              label={t('results.revenue')}
              value={formatMoney(data.total.revenue)}
              change={delta(data.total.revenue, data.previous.revenue)}
            />
            <Kpi
              icon={TrendingUp}
              tone={data.total.result < 0 ? 'red' : 'emerald'}
              label={t('results.result')}
              value={formatMoney(data.total.result)}
              change={delta(data.total.result, data.previous.result)}
            />
            <Kpi icon={Percent} label={t('results.cmvPct')} value={pct(data.total.cmvPct)} />
            <Kpi
              icon={Users}
              label={t('results.personnelPct')}
              value={pct(data.total.personnelPct)}
            />
            <Kpi
              icon={UtensilsCrossed}
              label={t('results.cogs')}
              value={formatMoney(data.total.cogs)}
              change={delta(data.total.cogs, data.previous.cogs)}
              good={false}
            />
            <Kpi
              icon={Trash2}
              tone="red"
              label={t('results.waste')}
              value={formatMoney(data.total.waste)}
              change={delta(data.total.waste, data.previous.waste)}
              good={false}
            />
            <Kpi
              icon={ReceiptText}
              tone="amber"
              label={t('results.opex')}
              value={formatMoney(data.total.opex)}
              change={delta(data.total.opex, data.previous.opex)}
              good={false}
            />
            <Kpi
              icon={Scale}
              label={t('results.breakEven')}
              value={formatMoney(data.total.breakEven)}
            />
          </div>

          <section className="space-y-3">
            <h2 className="font-semibold">{t('results.byUnit')}</h2>
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>{t('hr.unit')}</th>
                    {(
                      [
                        'revenue',
                        'cogs',
                        'waste',
                        'opex',
                        'personnel',
                        'result',
                        'cmvPct',
                        'personnelPct',
                      ] as const
                    ).map((k) => (
                      <th key={k} className={`${thCls} text-right`}>
                        {t(`results.${k}` as TKey)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...data.units, { unitId: 'total', name: t('common.total'), ...data.total }].map(
                    (u) => (
                      <tr
                        key={u.unitId}
                        className={u.unitId === 'total' ? 'bg-gray-50 font-semibold' : ''}
                      >
                        <td className={tdCls}>{u.name}</td>
                        {(['revenue', 'cogs', 'waste', 'opex', 'personnel'] as const).map((k) => (
                          <td key={k} className={`${tdCls} whitespace-nowrap text-right`}>
                            {formatMoney(u[k])}
                          </td>
                        ))}
                        <td
                          className={`${tdCls} whitespace-nowrap text-right ${u.result < 0 ? 'text-red-600' : 'text-emerald-600'}`}
                        >
                          {formatMoney(u.result)}
                        </td>
                        <td className={`${tdCls} text-right`}>{pct(u.cmvPct)}</td>
                        <td className={`${tdCls} text-right`}>{pct(u.personnelPct)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <Panel
            title={t('results.daily')}
            action={
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-brand-600" />
                  {t('results.revenue')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  {t('results.result')}
                </span>
              </div>
            }
          >
            <div className="px-3 pt-4 pb-2">
              <AreaChart
                labels={days.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)}
                format={formatMoney}
                series={[
                  {
                    name: t('results.revenue'),
                    color: '#4f46e5',
                    values: days.map((d) => byDay.get(d)?.revenue ?? 0),
                  },
                  {
                    name: t('results.result'),
                    color: '#10b981',
                    values: days.map((d) => byDay.get(d)?.result ?? 0),
                  },
                ]}
              />
            </div>
          </Panel>
          <section>
            <p className="text-xs text-gray-500">{t('results.note')}</p>
          </section>
        </>
      )}
    </div>
  );
}
