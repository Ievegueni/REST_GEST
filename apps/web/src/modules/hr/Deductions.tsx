import { useState, type FormEvent } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton';
import {
  buttonCls,
  ErrorBox,
  inputBase,
  inputCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { today } from './types';

type D = {
  id: string;
  type: 'ADVANCE' | 'OTHER';
  description: string;
  date: string;
  amount: number;
  installmentAmount: number;
  remaining: number;
};

export function Deductions({ employeeId }: { employeeId: string }) {
  const { data, reload } = useApi<D[]>(`/employees/${employeeId}/deductions`);
  const [f, setF] = useState({
    type: 'ADVANCE',
    description: '',
    date: today(),
    amount: '',
    installments: '1',
  });
  const [error, setError] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api(`/employees/${employeeId}/deductions`, {
        body: { ...f, amount: Number(f.amount), installments: Number(f.installments) },
      });
      setF({ ...f, description: '', amount: '', installments: '1' });
      reload();
    } catch (x) {
      setError((x as Error).message);
    }
  };

  return (
    <section className="space-y-2 rounded border bg-white p-4">
      <h3 className="font-medium">{t('deductions.title')}</h3>
      <table className={tableCls}>
        <thead className="bg-slate-50">
          <tr>
            <th className={thCls}>{t('common.date')}</th>
            <th className={thCls}>{t('deductions.type')}</th>
            <th className={thCls}>{t('deductions.description')}</th>
            <th className={`${thCls} text-right`}>{t('deductions.amount')}</th>
            <th className={`${thCls} text-right`}>{t('deductions.remaining')}</th>
            <th className={thCls} />
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((d) => (
            <tr key={d.id}>
              <td className={tdCls}>{formatDate(d.date)}</td>
              <td className={tdCls}>{t(`deductionType.${d.type}`)}</td>
              <td className={tdCls}>{d.description}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(d.amount)}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(d.remaining)}</td>
              <td className={tdCls}>
                {d.remaining === d.amount && (
                  <ConfirmButton
                    className="text-red-600 hover:underline"
                    onConfirm={() => api(`/deductions/${d.id}`, { method: 'DELETE' }).then(reload)}
                  >
                    {t('common.remove')}
                  </ConfirmButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 text-sm">
        <select
          aria-label={t('deductions.type')}
          className={`${inputBase} w-36`}
          value={f.type}
          onChange={(e) => setF({ ...f, type: e.target.value })}
        >
          <option value="ADVANCE">{t('deductionType.ADVANCE')}</option>
          <option value="OTHER">{t('deductionType.OTHER')}</option>
        </select>
        <input
          aria-label={t('deductions.description')}
          placeholder={t('deductions.description')}
          className={`${inputCls} max-w-xs`}
          required
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
        <input
          aria-label={t('common.date')}
          className={`${inputBase} w-40`}
          type="date"
          required
          value={f.date}
          onChange={(e) => setF({ ...f, date: e.target.value })}
        />
        <input
          aria-label={t('deductions.amount')}
          placeholder={t('deductions.amount')}
          className={`${inputBase} w-32`}
          type="number"
          min={1}
          step={1}
          required
          value={f.amount}
          onChange={(e) => setF({ ...f, amount: e.target.value })}
        />
        <input
          aria-label={t('deductions.installments')}
          title={t('deductions.installments')}
          className={`${inputBase} w-20`}
          type="number"
          min={1}
          max={60}
          value={f.installments}
          onChange={(e) => setF({ ...f, installments: e.target.value })}
        />
        <button className={buttonCls}>{t('deductions.add')}</button>
      </form>
      <ErrorBox>{error}</ErrorBox>
    </section>
  );
}
