import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { buttonCls, ErrorBox, inputCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

type Chart = {
  kind: 'bar' | 'line';
  title: string;
  labels: string[];
  series: { name: string; values: number[] }[];
};
type Turn = { role: 'user' | 'assistant'; content: string; charts?: Chart[] };
type Status = { configured: boolean; used: number; limit: number | null };

const COLORS = ['bg-sky-600', 'bg-amber-500', 'bg-emerald-600'];
const STROKES = ['#0284c7', '#f59e0b', '#059669'];

/** Markdown mínimo e seguro: **negrito** e linhas "- item". */
function inline(s: string) {
  return s
    .split(/(\*\*[^*]+\*\*)/)
    .map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}
function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      out.push(
        <ul key={out.length} className="ml-5 list-disc">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const line of text.split('\n')) {
    const m = /^\s*[-*]\s+(.*)/.exec(line);
    if (m) list.push(m[1]!);
    else {
      flush();
      const h = /^#+\s+(.*)/.exec(line);
      out.push(
        line.trim() ? (
          <p key={out.length} className={h ? 'font-semibold' : ''}>
            {inline(h ? h[1]! : line)}
          </p>
        ) : (
          <Fragment key={out.length} />
        ),
      );
    }
  }
  flush();
  return <div className="space-y-2">{out}</div>;
}

function ChartView({ chart }: { chart: Chart }) {
  const all = chart.series.flatMap((s) => s.values);
  const max = Math.max(1, ...all.map(Math.abs));
  const fmt = (v: number) => v.toLocaleString('pt-AO');
  return (
    <figure className="mt-3 rounded border bg-white p-3">
      <figcaption className="mb-2 text-sm font-medium">{chart.title}</figcaption>
      {chart.kind === 'bar' ? (
        <div className="flex h-44 items-end gap-2 overflow-x-auto">
          {chart.labels.map((l, i) => (
            <div key={i} className="flex min-w-10 flex-1 flex-col items-center">
              <div className="flex h-36 items-end gap-0.5">
                {chart.series.map((s, j) => (
                  <div
                    key={j}
                    title={`${s.name}: ${fmt(s.values[i] ?? 0)}`}
                    className={`w-3 ${(s.values[i] ?? 0) < 0 ? 'bg-red-600' : COLORS[j]}`}
                    style={{ height: `${(Math.abs(s.values[i] ?? 0) / max) * 140}px` }}
                  />
                ))}
              </div>
              <span className="mt-1 truncate text-xs text-slate-500" title={l}>
                {l}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <svg viewBox="0 0 300 120" className="h-44 w-full" preserveAspectRatio="none">
          {chart.series.map((s, j) => (
            <polyline
              key={j}
              fill="none"
              stroke={STROKES[j]}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              points={s.values
                .map(
                  (v, i) =>
                    `${(i / Math.max(1, chart.labels.length - 1)) * 300},${60 - (v / max) * 55}`,
                )
                .join(' ')}
            />
          ))}
        </svg>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
        {chart.kind === 'line' && (
          <span>
            {chart.labels[0]} → {chart.labels.at(-1)}
          </span>
        )}
        {chart.series.map((s, j) => (
          <span key={j} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 ${COLORS[j]}`} /> {s.name}
          </span>
        ))}
      </div>
    </figure>
  );
}

export function AiPage() {
  const allowed = useCan('ai.use');
  const { data: status, reload } = useApi<Status>(allowed ? '/ai/status' : null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!allowed) return <p className="text-slate-500">{t('ai.forbidden')}</p>;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: question }];
    setTurns(next);
    setQ('');
    setBusy(true);
    setError('');
    try {
      const r = await api<{ answer: string; charts: Chart[] }>('/ai/chat', {
        method: 'POST',
        body: { messages: next.slice(-20).map(({ role, content }) => ({ role, content })) },
      });
      setTurns([...next, { role: 'assistant', content: r.answer, charts: r.charts }]);
    } catch (err) {
      setError((err as Error).message);
      setTurns(turns);
      setQ(question);
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{t('ai.title')}</h1>
        {status && (
          <span className="text-xs text-slate-500">
            {t('ai.usage', {
              used: status.used,
              limit: status.limit ?? '∞',
            })}
          </span>
        )}
      </div>
      {status && !status.configured && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('ai.notConfigured')}
        </p>
      )}

      {turns.length === 0 && (
        <div className="rounded border bg-white p-4 text-sm text-slate-600">
          <p className="mb-2">{t('ai.intro')}</p>
          <ul className="space-y-1">
            {(['ai.example1', 'ai.example2', 'ai.example3'] as const).map((k) => (
              <li key={k}>
                <button
                  className="text-left text-sky-700 hover:underline"
                  onClick={() => setQ(t(k))}
                >
                  {t(k)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        {turns.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'ml-auto w-fit max-w-[80%] rounded bg-sky-600 px-3 py-2 text-white'
                : 'rounded border bg-white p-3 text-sm'
            }
          >
            {m.role === 'user' ? m.content : <Markdown text={m.content} />}
            {m.charts?.map((c, j) => (
              <ChartView key={j} chart={c} />
            ))}
          </div>
        ))}
        {busy && <p className="text-sm text-slate-500">{t('ai.thinking')}</p>}
      </div>

      <ErrorBox>{error}</ErrorBox>
      <form onSubmit={send} className="flex gap-2">
        <input
          className={inputCls}
          value={q}
          maxLength={4000}
          placeholder={t('ai.placeholder')}
          aria-label={t('ai.placeholder')}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className={buttonCls} disabled={busy || !q.trim()}>
          {t('ai.send')}
        </button>
      </form>
      {turns.length > 0 && (
        <button className="text-xs text-slate-500 hover:underline" onClick={() => setTurns([])}>
          {t('ai.clear')}
        </button>
      )}
    </div>
  );
}
