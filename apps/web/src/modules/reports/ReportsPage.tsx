import { useState } from 'react';
import { ErrorBox, inputCls, secondaryCls, tableCls, tdCls, thCls } from '../../components/ui';
import { useSession } from '../../features/session';
import { t } from '../../i18n';
import { apiDownload } from '../../lib/api';
import { formatCell, type ColType } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { useLocations } from '../stock/useLocations';
import { categoryTree, type Category } from '../types';

type ReportMeta = { name: string; title: string; period: boolean };
type Report = {
  title: string;
  columns: { key: string; label: string; type: ColType }[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
  notes?: string;
};

const GROUPS: Record<string, { value: string; label: Parameters<typeof t>[0] }[]> = {
  stock: [
    { value: '', label: 'reports.byLocation' },
    { value: 'product', label: 'reports.byProduct' },
  ],
  consumption: [
    { value: '', label: 'reports.byProduct' },
    { value: 'category', label: 'reports.byCategory' },
  ],
};

export function ReportsPage() {
  const { data: list } = useApi<ReportMeta[]>('/reports');
  const { data: cats } = useApi<Category[]>('/categories');
  const { unitId } = useSession();
  const { locations } = useLocations();
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [group, setGroup] = useState('');
  const [stagnant, setStagnant] = useState(false);
  const [error, setError] = useState('');

  const meta = list?.find((r) => r.name === name);
  const loc = locations.some((l) => l.id === locationId) ? locationId : '';
  const qs = new URLSearchParams({
    ...(meta?.period && from && { from }),
    ...(meta?.period && to && { to }),
    ...(unitId && { unitId }),
    ...(loc && { locationId: loc }),
    ...(categoryId && { categoryId }),
    ...(GROUPS[name] && group && { group }),
    ...(name === 'rotation' && stagnant && { stagnantOnly: 'true' }),
  }).toString();
  const { data: report, error: loadError } = useApi<Report>(name ? `/reports/${name}?${qs}` : null);

  const download = (format: 'xlsx' | 'pdf') =>
    apiDownload(`/reports/${name}?${qs}&format=${format}`, `${name}.${format}`).catch((e: Error) =>
      setError(e.message),
    );

  const numeric = (type: ColType) => type !== 'text' && type !== 'date';

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="w-full shrink-0 space-y-1 lg:w-56">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">{t('nav.reports')}</h1>
        {list?.map((r) => (
          <button
            key={r.name}
            className={`block w-full rounded px-3 py-2 text-left text-sm ${r.name === name ? 'bg-brand-50 font-medium text-brand-700' : 'text-gray-700 hover:bg-gray-100'}`}
            onClick={() => {
              setName(r.name);
              setGroup('');
            }}
          >
            {r.title}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">
        {!name && <p className="text-slate-500">{t('reports.choose')}</p>}
        {name && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-white shadow-xs p-3 text-sm">
            {meta?.period && (
              <>
                <label className="space-y-1">
                  <span>{t('reports.from')}</span>
                  <input
                    className={inputCls}
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span>{t('reports.to')}</span>
                  <input
                    className={inputCls}
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="space-y-1">
              <span>{t('stock.location')}</span>
              <select
                className={inputCls}
                value={loc}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">{t('stock.allLocations')}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span>{t('product.category')}</span>
              <select
                className={inputCls}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">{t('common.all')}</option>
                {categoryTree(cats ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.path}
                  </option>
                ))}
              </select>
            </label>
            {GROUPS[name] && (
              <label className="space-y-1">
                <span>{t('reports.group')}</span>
                <select
                  className={inputCls}
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  {GROUPS[name]!.map((g) => (
                    <option key={g.value} value={g.value}>
                      {t(g.label)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {name === 'rotation' && (
              <label className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={stagnant}
                  onChange={(e) => setStagnant(e.target.checked)}
                />
                {t('reports.stagnantOnly')}
              </label>
            )}
            <div className="ml-auto flex gap-2">
              <button className={secondaryCls} onClick={() => download('xlsx')}>
                {t('reports.excel')}
              </button>
              <button className={secondaryCls} onClick={() => download('pdf')}>
                {t('reports.pdf')}
              </button>
            </div>
          </div>
        )}
        <ErrorBox>{error || loadError}</ErrorBox>
        {report && name && (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{report.title}</h2>
              <span className="text-sm text-slate-500">
                {t('reports.rows', { n: report.rows.length })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead className="bg-slate-100">
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c.key} className={`${thCls} ${numeric(c.type) ? 'text-right' : ''}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      {report.columns.map((c) => (
                        <td
                          key={c.key}
                          className={`${tdCls} ${numeric(c.type) ? 'text-right whitespace-nowrap' : ''}`}
                        >
                          {formatCell(c.type, r[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {report.totals && (
                    <tr className="bg-slate-50 font-medium">
                      {report.columns.map((c) => (
                        <td
                          key={c.key}
                          className={`${tdCls} ${numeric(c.type) ? 'text-right whitespace-nowrap' : ''}`}
                        >
                          {formatCell(c.type, report.totals![c.key])}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {report.notes && <p className="text-xs text-slate-500">{report.notes}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
