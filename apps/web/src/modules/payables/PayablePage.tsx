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
import { t, type TKey } from '../../i18n';
import { api, apiOpen, apiUpload } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { today } from '../hr/types';

type Payable = {
  id: string;
  documentNumber: string | null;
  description: string | null;
  issueDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'OPEN' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  supplier: { name: string };
  unit: { name: string };
  receipt: { id: string; number: number } | null;
  payments: {
    id: string;
    date: string;
    amount: number;
    reference: string | null;
    attachmentUrl: string | null;
    paymentMethod: { name: string } | null;
  }[];
};

export function PayablePage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error: loadError, reload } = useApi<Payable>(`/payables/${id}`);
  const { data: methods } =
    useApi<{ id: string; name: string; active: boolean }[]>('/payment-methods');
  const [f, setF] = useState({ date: today(), amount: '', paymentMethodId: '', reference: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  if (loadError) return <ErrorBox>{loadError}</ErrorBox>;
  if (!p) return <p className="text-slate-500">{t('common.loading')}</p>;
  const balance = p.amount - p.paidAmount;
  const open = p.status === 'OPEN' || p.status === 'PARTIAL';

  const call = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      reload();
    } catch (x) {
      setError((x as Error).message);
    }
  };
  const pay = (e: FormEvent) => {
    e.preventDefault();
    void call(async () => {
      const att = file ? await apiUpload<{ url: string; name: string }>('/uploads', file) : null;
      await api(`/payables/${p.id}/payments`, {
        body: {
          ...f,
          amount: Number(f.amount),
          paymentMethodId: f.paymentMethodId || null,
          attachmentUrl: att?.url ?? null,
          attachmentName: att?.name ?? null,
        },
      });
      setF({ ...f, amount: '', reference: '' });
      setFile(null);
    });
  };

  return (
    <div className="max-w-4xl space-y-4">
      <Link to="/contas-a-pagar" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        {p.supplier.name} · {p.documentNumber ?? p.description ?? ''}
        <span className="ml-2 text-sm text-slate-500">
          ({t(`payableStatus.${p.status}` as TKey)})
        </span>
      </h1>
      <dl className="grid gap-1 rounded-xl border bg-white shadow-xs p-4 text-sm sm:grid-cols-3">
        <div>
          {t('payables.issueDate')}: {formatDate(p.issueDate)}
        </div>
        <div>
          {t('payables.dueDate')}: {formatDate(p.dueDate)}
        </div>
        <div>
          {t('hr.unit')}: {p.unit.name}
        </div>
        <div>
          {t('payables.amount')}: <strong>{formatMoney(p.amount)}</strong>
        </div>
        <div>
          {t('payables.paid')}: {formatMoney(p.paidAmount)}
        </div>
        <div>
          {t('payables.balance')}: <strong>{formatMoney(balance)}</strong>
        </div>
        {p.receipt && (
          <div>
            <Link to={`/compras/recepcoes/${p.receipt.id}`} className="hover:underline">
              {t('payables.fromReceipt', { n: p.receipt.number })}
            </Link>
          </div>
        )}
      </dl>

      <section className="space-y-2">
        <h2 className="font-medium">{t('payables.payments')}</h2>
        <table className={tableCls}>
          <thead className="bg-slate-100">
            <tr>
              <th className={thCls}>{t('common.date')}</th>
              <th className={thCls}>{t('costs.paymentMethod')}</th>
              <th className={thCls}>{t('payables.reference')}</th>
              <th className={`${thCls} text-right`}>{t('payables.amount')}</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {p.payments.map((x) => (
              <tr key={x.id}>
                <td className={tdCls}>{formatDate(x.date)}</td>
                <td className={tdCls}>{x.paymentMethod?.name}</td>
                <td className={tdCls}>{x.reference}</td>
                <td className={`${tdCls} text-right`}>{formatMoney(x.amount)}</td>
                <td className={`${tdCls} whitespace-nowrap`}>
                  {x.attachmentUrl && (
                    <button
                      className="mr-3 text-blue-700 hover:underline"
                      onClick={() =>
                        apiOpen(x.attachmentUrl!).catch((e: Error) => setError(e.message))
                      }
                    >
                      {t('payables.proof')}
                    </button>
                  )}
                  <ConfirmButton
                    className="text-red-600 hover:underline"
                    onConfirm={() =>
                      call(() => api(`/payables/${p.id}/payments/${x.id}`, { method: 'DELETE' }))
                    }
                  >
                    {t('common.remove')}
                  </ConfirmButton>
                </td>
              </tr>
            ))}
            {!p.payments.length && (
              <tr>
                <td className={`${tdCls} text-slate-500`} colSpan={5}>
                  {t('common.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {open && (
          <form onSubmit={pay} className="flex flex-wrap items-end gap-2 text-sm">
            <input
              aria-label={t('common.date')}
              className={`${inputBase} w-40`}
              type="date"
              required
              value={f.date}
              onChange={(e) => setF({ ...f, date: e.target.value })}
            />
            <input
              aria-label={t('payables.amount')}
              placeholder={formatMoney(balance)}
              className={`${inputBase} w-36`}
              type="number"
              min={1}
              max={balance}
              step={1}
              required
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
            <select
              aria-label={t('costs.paymentMethod')}
              className={`${inputBase} w-40`}
              value={f.paymentMethodId}
              onChange={(e) => setF({ ...f, paymentMethodId: e.target.value })}
            >
              <option value="">{t('costs.paymentMethod')}…</option>
              {methods
                ?.filter((m) => m.active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
            <input
              aria-label={t('payables.reference')}
              placeholder={t('payables.reference')}
              className={`${inputCls} max-w-xs`}
              value={f.reference}
              onChange={(e) => setF({ ...f, reference: e.target.value })}
            />
            <input
              aria-label={t('payables.proof')}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button className={buttonCls}>{t('payables.pay')}</button>
          </form>
        )}
      </section>
      <ErrorBox>{error}</ErrorBox>
      {open && !p.receipt && p.paidAmount === 0 && (
        <ConfirmButton
          className={secondaryCls}
          onConfirm={() => call(() => api(`/payables/${p.id}/cancel`, { method: 'POST' }))}
        >
          {t('payables.cancel')}
        </ConfirmButton>
      )}
    </div>
  );
}
