import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmButton } from '../../components/ConfirmButton';
import {
  buttonCls,
  ErrorBox,
  inputBase,
  inputCls,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Session = {
  id: string;
  businessDate: string;
  shift: string;
  status: 'OPEN' | 'CLOSED' | 'VALIDATED';
  openingFloat: number;
  justification: string | null;
  denominations: Record<string, number> | null;
  unit: { name: string };
  movements: {
    id: string;
    type: 'WITHDRAWAL' | 'DEPOSIT' | 'EXPENSE';
    amount: number;
    description: string;
    createdAt: string;
  }[];
  lines: {
    paymentMethod: { id: string; name: string; isCash: boolean };
    systemAmount: number;
    countedAmount: number | null;
    difference: number | null;
  }[];
  summary: {
    deposits: number;
    withdrawals: number;
    expenses: number;
    expectedCash: number;
    countedCash: number | null;
    cashDifference: number | null;
    totalDifference: number;
    limit: number | null;
  };
};

export function CashSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApi<Session>(`/cash-sessions/${id}`);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <SessionView key={JSON.stringify(data)} s={data} reload={reload} />;
}

function SessionView({ s, reload }: { s: Session; reload: () => void }) {
  const canClose = useCan('cash.close');
  const canValidate = useCan('cash.validate');
  const editable = s.status === 'OPEN' && canClose;
  const { data: cats } = useApi<{ id: string; name: string; active: boolean }[]>(
    editable ? '/cost-categories' : null,
  );
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      s.lines.map((l) => [
        l.paymentMethod.id,
        {
          system: String(l.systemAmount),
          counted: l.countedAmount == null ? '' : String(l.countedAmount),
        },
      ]),
    ),
  );
  const [notes, setNotes] = useState<{ note: string; qty: string }[]>(() =>
    Object.entries(s.denominations ?? {}).map(([note, qty]) => ({ note, qty: String(qty) })),
  );
  const [mv, setMv] = useState({ type: 'WITHDRAWAL', amount: '', description: '', categoryId: '' });
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');

  const call = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      reload();
    } catch (x) {
      setError((x as Error).message);
    }
  };
  const notesTotal = notes.reduce((x, n) => x + Number(n.note || 0) * Number(n.qty || 0), 0);
  const saveAmounts = () =>
    call(() =>
      api(`/cash-sessions/${s.id}/amounts`, {
        method: 'PUT',
        body: {
          amounts: Object.entries(values).map(([paymentMethodId, v]) => ({
            paymentMethodId,
            systemAmount: Number(v.system || 0),
            countedAmount: v.counted === '' ? null : Number(v.counted),
          })),
          denominations: notes.length
            ? Object.fromEntries(
                notes.filter((n) => n.note && n.qty).map((n) => [n.note, Number(n.qty)]),
              )
            : null,
        },
      }),
    );
  const addMovement = (e: FormEvent) => {
    e.preventDefault();
    void call(() =>
      api(`/cash-sessions/${s.id}/movements`, {
        body: { ...mv, amount: Number(mv.amount), categoryId: mv.categoryId || null },
      }),
    );
  };
  const over = s.summary.limit != null && Math.abs(s.summary.totalDifference) > s.summary.limit;
  const date = formatDate(s.businessDate);

  return (
    <div className="max-w-5xl space-y-4">
      <Link to="/caixa" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h1 className="text-xl font-semibold">
        {t('cash.session', { date })} {s.shift && `· ${s.shift}`} · {s.unit.name}
        <span className="ml-2 text-sm text-slate-500">({t(`cashStatus.${s.status}`)})</span>
      </h1>
      <p className="text-sm text-slate-600">
        {t('cash.openingFloat')}: {formatMoney(s.openingFloat)}
      </p>

      <section className="space-y-2">
        <table className={tableCls}>
          <thead className="bg-slate-100">
            <tr>
              <th className={thCls}>{t('costs.paymentMethod')}</th>
              <th className={`${thCls} text-right`}>{t('cash.system')}</th>
              <th className={`${thCls} text-right`}>{t('cash.counted')}</th>
              <th className={`${thCls} text-right`}>{t('cash.difference')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {s.lines.map((l) => {
              const v = values[l.paymentMethod.id]!;
              const set = (k: 'system' | 'counted', x: string) =>
                setValues({ ...values, [l.paymentMethod.id]: { ...v, [k]: x } });
              return (
                <tr key={l.paymentMethod.id}>
                  <td className={tdCls}>{l.paymentMethod.name}</td>
                  <td className={`${tdCls} text-right`}>
                    {editable ? (
                      <input
                        aria-label={`${t('cash.system')} ${l.paymentMethod.name}`}
                        className={`${inputBase} w-36 text-right`}
                        type="number"
                        step={1}
                        value={v.system}
                        onChange={(e) => set('system', e.target.value)}
                      />
                    ) : (
                      formatMoney(l.systemAmount)
                    )}
                  </td>
                  <td className={`${tdCls} text-right`}>
                    {editable ? (
                      <input
                        aria-label={`${t('cash.counted')} ${l.paymentMethod.name}`}
                        className={`${inputBase} w-36 text-right`}
                        type="number"
                        min={0}
                        step={1}
                        value={v.counted}
                        onChange={(e) => set('counted', e.target.value)}
                      />
                    ) : (
                      formatMoney(l.countedAmount)
                    )}
                  </td>
                  <td className={`${tdCls} text-right`}>
                    {l.paymentMethod.isCash
                      ? '↓'
                      : l.difference == null
                        ? '—'
                        : formatMoney(l.difference)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {editable && (
          <details className="rounded border bg-white p-3 text-sm">
            <summary className="cursor-pointer">{t('cash.denominations')}</summary>
            <div className="mt-2 space-y-1">
              {notes.map((n, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    aria-label={t('cash.note')}
                    placeholder={t('cash.note')}
                    className={`${inputBase} w-28`}
                    type="number"
                    min={0}
                    value={n.note}
                    onChange={(e) =>
                      setNotes(notes.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
                    }
                  />
                  <span className="self-center">×</span>
                  <input
                    aria-label={t('cash.quantity')}
                    placeholder={t('cash.quantity')}
                    className={`${inputBase} w-24`}
                    type="number"
                    min={0}
                    value={n.qty}
                    onChange={(e) =>
                      setNotes(notes.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
                    }
                  />
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={secondaryCls}
                  onClick={() => setNotes([...notes, { note: '', qty: '' }])}
                >
                  {t('common.add')}
                </button>
                <span>
                  {t('common.total')}: {formatMoney(notesTotal)}
                </span>
                {s.lines
                  .filter((l) => l.paymentMethod.isCash)
                  .slice(0, 1)
                  .map((l) => (
                    <button
                      key={l.paymentMethod.id}
                      type="button"
                      className={secondaryCls}
                      onClick={() =>
                        setValues({
                          ...values,
                          [l.paymentMethod.id]: {
                            ...values[l.paymentMethod.id]!,
                            counted: String(notesTotal),
                          },
                        })
                      }
                    >
                      {t('cash.useCount')}
                    </button>
                  ))}
              </div>
            </div>
          </details>
        )}
        {editable && (
          <button className={buttonCls} onClick={saveAmounts}>
            {t('cash.saveAmounts')}
          </button>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t('cash.movements')}</h2>
        <ul className="divide-y rounded border bg-white text-sm">
          {s.movements.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-3 py-2">
              <span>
                {t(`cash.mv.${m.type}` as TKey)} · {m.description}{' '}
                <span className="text-xs text-slate-400">{formatDateTime(m.createdAt)}</span>
              </span>
              <span className="flex items-center gap-3">
                {formatMoney(m.type === 'DEPOSIT' ? m.amount : -m.amount)}
                {editable && (
                  <ConfirmButton
                    className="text-red-600 hover:underline"
                    onConfirm={() =>
                      call(() =>
                        api(`/cash-sessions/${s.id}/movements/${m.id}`, { method: 'DELETE' }),
                      )
                    }
                  >
                    {t('common.remove')}
                  </ConfirmButton>
                )}
              </span>
            </li>
          ))}
          {!s.movements.length && <li className="px-3 py-2 text-slate-500">{t('common.empty')}</li>}
        </ul>
        {editable && (
          <form onSubmit={addMovement} className="flex flex-wrap items-end gap-2 text-sm">
            <select
              aria-label={t('alerts.type')}
              className={`${inputBase} w-36`}
              value={mv.type}
              onChange={(e) => setMv({ ...mv, type: e.target.value })}
            >
              {(['WITHDRAWAL', 'DEPOSIT', 'EXPENSE'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`cash.mv.${x}`)}
                </option>
              ))}
            </select>
            <input
              aria-label={t('costs.amount')}
              placeholder={t('costs.amount')}
              className={`${inputBase} w-32`}
              type="number"
              min={1}
              step={1}
              required
              value={mv.amount}
              onChange={(e) => setMv({ ...mv, amount: e.target.value })}
            />
            <input
              aria-label={t('costs.description')}
              placeholder={t('costs.description')}
              className={`${inputCls} max-w-xs`}
              required
              value={mv.description}
              onChange={(e) => setMv({ ...mv, description: e.target.value })}
            />
            {mv.type === 'EXPENSE' && (
              <select
                aria-label={t('costs.category')}
                className={`${inputBase} w-44`}
                required
                value={mv.categoryId}
                onChange={(e) => setMv({ ...mv, categoryId: e.target.value })}
              >
                <option value="">{t('costs.category')}…</option>
                {cats
                  ?.filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
            <button className={secondaryCls}>{t('cash.addMovement')}</button>
          </form>
        )}
      </section>

      <section className="grid gap-2 rounded border bg-white p-4 text-sm sm:grid-cols-2">
        <div>
          {t('cash.expectedCash')}: <strong>{formatMoney(s.summary.expectedCash)}</strong>
        </div>
        <div>
          {t('cash.countedCash')}: <strong>{formatMoney(s.summary.countedCash)}</strong>
        </div>
        <div className={s.summary.totalDifference ? 'text-red-700' : 'text-emerald-700'}>
          {t('cash.totalDifference')}: <strong>{formatMoney(s.summary.totalDifference)}</strong>
        </div>
        {s.summary.limit != null && (
          <div className="text-slate-500">
            {t('cash.limit', { limit: formatMoney(s.summary.limit) })}
          </div>
        )}
        {s.justification && <div className="sm:col-span-2">{s.justification}</div>}
      </section>

      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap items-end gap-2">
        {editable && (
          <>
            {over && (
              <input
                aria-label={t('cash.justification')}
                placeholder={t('cash.justification')}
                className={`${inputCls} max-w-md`}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
              />
            )}
            <ConfirmButton
              className={buttonCls}
              onConfirm={() =>
                call(() =>
                  api(`/cash-sessions/${s.id}/close`, {
                    body: { justification: justification || null },
                  }),
                )
              }
            >
              {t('cash.close')}
            </ConfirmButton>
          </>
        )}
        {s.status === 'CLOSED' && canValidate && (
          <>
            <ConfirmButton
              className={buttonCls}
              onConfirm={() =>
                call(() => api(`/cash-sessions/${s.id}/validate`, { method: 'POST' }))
              }
            >
              {t('cash.validate')}
            </ConfirmButton>
            <ConfirmButton
              className={secondaryCls}
              onConfirm={() => call(() => api(`/cash-sessions/${s.id}/reopen`, { method: 'POST' }))}
            >
              {t('cash.reopen')}
            </ConfirmButton>
          </>
        )}
      </div>
    </div>
  );
}
