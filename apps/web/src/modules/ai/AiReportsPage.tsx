import { useState } from 'react';
import { buttonCls, ErrorBox, inputBase, secondaryCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api, apiDownload } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { AiTabs, ChartView, Markdown, type Chart } from './AiPage';

type Kind = 'ANOMALIES' | 'WEEKLY';
type Row = {
  id: string;
  kind: Kind;
  unit: string | null;
  periodFrom: string;
  periodTo: string;
};
type Full = Row & { content: string; data: { charts?: Chart[] } };

export function AiReportsPage() {
  const manage = useCan('settings.manage');
  const [kind, setKind] = useState<Kind | ''>('');
  const { data: rows, error, reload } = useApi<Row[]>(`/ai/reports${kind ? `?kind=${kind}` : ''}`);
  const [open, setOpen] = useState<Full | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const view = (id: string) =>
    api<Full>(`/ai/reports/${id}`)
      .then((r) => setOpen({ ...r, unit: rows?.find((x) => x.id === id)?.unit ?? null }))
      .catch((e: Error) => setErr(e.message));
  const period = (r: Row) =>
    r.periodFrom === r.periodTo
      ? formatDate(r.periodFrom)
      : `${formatDate(r.periodFrom)} – ${formatDate(r.periodTo)}`;
  const run = async (k: Kind) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const r = await api<{ created: number }>('/ai/reports/run', { body: { kind: k } });
      setMsg(t('ai.reports.created', { n: r.created }));
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <AiTabs />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('ai.reports.kind')}
          className={`${inputBase} w-56`}
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind | '')}
        >
          <option value="">{t('ai.reports.all')}</option>
          <option value="ANOMALIES">{t('ai.reports.ANOMALIES')}</option>
          <option value="WEEKLY">{t('ai.reports.WEEKLY')}</option>
        </select>
        {manage && (
          <>
            <button className={secondaryCls} disabled={busy} onClick={() => run('ANOMALIES')}>
              {t('ai.reports.runAnomalies')}
            </button>
            <button className={secondaryCls} disabled={busy} onClick={() => run('WEEKLY')}>
              {t('ai.reports.runWeekly')}
            </button>
          </>
        )}
      </div>
      <ErrorBox>{error || err}</ErrorBox>
      {msg && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <ul className="divide-y rounded border bg-white text-sm">
          {rows?.length === 0 && <li className="p-3 text-slate-500">{t('ai.reports.empty')}</li>}
          {rows?.map((r) => (
            <li key={r.id}>
              <button
                className={`w-full px-3 py-2 text-left hover:bg-slate-50 ${open?.id === r.id ? 'bg-slate-100' : ''}`}
                onClick={() => view(r.id)}
              >
                <div className="font-medium">{t(`ai.reports.${r.kind}`)}</div>
                <div className="text-xs text-slate-500">
                  {r.unit ?? t('ai.reports.allUnits')} · {period(r)}
                </div>
              </button>
            </li>
          ))}
        </ul>
        {open && (
          <article className="rounded border bg-white p-4 text-sm">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{t(`ai.reports.${open.kind}`)}</h2>
                <p className="text-xs text-slate-500">
                  {open.unit ?? t('ai.reports.allUnits')} · {period(open)}
                </p>
              </div>
              <button
                className={buttonCls}
                onClick={() =>
                  apiDownload(
                    `/ai/reports/${open.id}/pdf`,
                    `ia-${open.periodFrom.slice(0, 10)}.pdf`,
                  ).catch((e: Error) => setErr(e.message))
                }
              >
                PDF
              </button>
            </div>
            <Markdown text={open.content} />
            {open.data.charts?.map((c, i) => (
              <ChartView key={i} chart={c} />
            ))}
          </article>
        )}
      </div>
    </div>
  );
}
