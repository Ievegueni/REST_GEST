import { useState } from 'react';
import { ErrorBox, inputCls, secondaryCls, tableCls, tdCls, thCls } from '../../components/ui';
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
}: {
  label: string;
  value: string;
  change?: number | null;
  good?: boolean;
}) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {change != null && (
        <div
          className={`text-xs ${change >= 0 === (good ?? true) ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toLocaleString('pt-AO')}%{' '}
          {t('results.vsPrevious')}
        </div>
      )}
    </div>
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

  const max = Math.max(
    1,
    ...(data?.daily ?? []).map((d) => Math.max(d.revenue, Math.abs(d.result))),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">{t('nav.results')}</h1>
        <label className="space-y-1 text-sm">
          <span>{t('reports.from')}</span>
          <input
            className={inputCls}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('reports.to')}</span>
          <input
            className={inputCls}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {(['day', 'month', 'unit'] as const).map((g) => (
          <span key={g} className="flex gap-1">
            <button className={secondaryCls} onClick={() => download(g, 'xlsx')}>
              Excel {t(`results.group.${g}`)}
            </button>
          </span>
        ))}
        <button className={secondaryCls} onClick={() => download('month', 'pdf')}>
          PDF
        </button>
      </div>
      <ErrorBox>{err || error}</ErrorBox>
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={t('results.revenue')}
              value={formatMoney(data.total.revenue)}
              change={delta(data.total.revenue, data.previous.revenue)}
            />
            <Kpi
              label={t('results.result')}
              value={formatMoney(data.total.result)}
              change={delta(data.total.result, data.previous.result)}
            />
            <Kpi label={t('results.cmvPct')} value={pct(data.total.cmvPct)} />
            <Kpi label={t('results.personnelPct')} value={pct(data.total.personnelPct)} />
            <Kpi
              label={t('results.cogs')}
              value={formatMoney(data.total.cogs)}
              change={delta(data.total.cogs, data.previous.cogs)}
              good={false}
            />
            <Kpi
              label={t('results.waste')}
              value={formatMoney(data.total.waste)}
              change={delta(data.total.waste, data.previous.waste)}
              good={false}
            />
            <Kpi
              label={t('results.opex')}
              value={formatMoney(data.total.opex)}
              change={delta(data.total.opex, data.previous.opex)}
              good={false}
            />
            <Kpi label={t('results.breakEven')} value={formatMoney(data.total.breakEven)} />
          </div>

          <section className="space-y-2">
            <h2 className="font-medium">{t('results.byUnit')}</h2>
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead className="bg-slate-100">
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
                        className={u.unitId === 'total' ? 'bg-slate-50 font-medium' : ''}
                      >
                        <td className={tdCls}>{u.name}</td>
                        {(['revenue', 'cogs', 'waste', 'opex', 'personnel'] as const).map((k) => (
                          <td key={k} className={`${tdCls} whitespace-nowrap text-right`}>
                            {formatMoney(u[k])}
                          </td>
                        ))}
                        <td
                          className={`${tdCls} whitespace-nowrap text-right ${u.result < 0 ? 'text-red-700' : 'text-emerald-700'}`}
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

          <section className="space-y-2">
            <h2 className="font-medium">{t('results.daily')}</h2>
            <div
              className="flex h-48 items-end gap-1 overflow-x-auto rounded border bg-white p-3"
              role="img"
              aria-label={t('results.daily')}
            >
              {data.daily.map((d) => (
                <div
                  key={d.date}
                  className="flex min-w-6 flex-1 flex-col items-center justify-end gap-0.5"
                  title={`${d.date.split('-').reverse().join('/')}: ${t('results.revenue')} ${formatMoney(d.revenue)} · ${t('results.result')} ${formatMoney(d.result)}`}
                >
                  <div className="flex w-full items-end gap-0.5">
                    <div
                      className="flex-1 bg-slate-300"
                      style={{ height: `${(d.revenue / max) * 140}px` }}
                    />
                    <div
                      className={`flex-1 ${d.result < 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ height: `${(Math.abs(d.result) / max) * 140}px` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{d.date.slice(8)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              <span className="mr-1 inline-block h-2 w-3 bg-slate-300" /> {t('results.revenue')} ·{' '}
              <span className="mx-1 inline-block h-2 w-3 bg-emerald-500" /> {t('results.result')}
            </p>
            <p className="text-xs text-slate-500">{t('results.note')}</p>
          </section>
        </>
      )}
    </div>
  );
}
