import { useState } from 'react';
import { buttonCls, ErrorBox, inputCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

type S = {
  payrollWeeklyHours: number | null;
  payrollOvertimeRate: string | null;
  payrollMonthDays: number | null;
};

export function PayrollSettingsPage() {
  const { data, error } = useApi<S>('/settings');
  return data ? <Form initial={data} /> : <ErrorBox>{error}</ErrorBox>;
}

function Form({ initial }: { initial: S }) {
  const manage = useCan('settings.manage');
  const [v, setV] = useState({
    payrollWeeklyHours: initial.payrollWeeklyHours?.toString() ?? '',
    payrollOvertimeRate:
      initial.payrollOvertimeRate == null ? '' : String(Number(initial.payrollOvertimeRate)),
    payrollMonthDays: initial.payrollMonthDays?.toString() ?? '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    setMsg('');
    setError('');
    const n = (x: string) => (x === '' ? null : Number(x));
    try {
      await api('/settings', {
        method: 'PATCH',
        body: {
          payrollWeeklyHours: n(v.payrollWeeklyHours),
          payrollOvertimeRate: n(v.payrollOvertimeRate),
          payrollMonthDays: n(v.payrollMonthDays),
        },
      });
      setMsg(t('common.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="max-w-md space-y-3 rounded-xl border bg-white shadow-xs p-4">
      <p className="text-xs text-slate-500">{t('payroll.settingsHint')}</p>
      {(
        [
          ['payrollWeeklyHours', 'payroll.weeklyHours'],
          ['payrollOvertimeRate', 'payroll.overtimeRate'],
          ['payrollMonthDays', 'payroll.monthDays'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="block space-y-1 text-sm">
          <span>{t(label)}</span>
          <input
            className={inputCls}
            type="number"
            step="any"
            min={0}
            disabled={!manage}
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
          />
        </label>
      ))}
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {manage && (
        <button className={buttonCls} onClick={save}>
          {t('common.save')}
        </button>
      )}
    </div>
  );
}
