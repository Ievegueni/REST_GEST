import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buttonCls,
  ErrorBox,
  inputBase,
  PageHeader,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { UnitSelect, useUnitChoice } from '../hr/UnitSelect';

type Run = {
  id: string;
  year: number;
  month: number;
  status: string;
  totalNet: number;
  totalCost: number;
  unit: { name: string };
  _count: { lines: number };
};

export function PayrollPage() {
  const navigate = useNavigate();
  const { data, error } = useApi<Run[]>('/payroll-runs');
  const [unitId, setUnitId] = useState('');
  const { units, unit } = useUnitChoice(unitId);
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const process = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const run = await api<{ id: string }>('/payroll-runs', {
        body: { unitId: unit, year: Number(year), month: Number(month) },
      });
      navigate(`/salarios/${run.id}`);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('nav.payroll')} />
      <form
        onSubmit={process}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white shadow-xs p-4"
      >
        <UnitSelect value={unit} units={units} onChange={setUnitId} />
        <label className="space-y-1 text-sm">
          <span>{t('payroll.year')}</span>
          <input
            className={`${inputBase} w-24`}
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('payroll.month')}</span>
          <input
            className={`${inputBase} w-20`}
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button className={buttonCls} disabled={busy || !unit}>
          {t('payroll.process')}
        </button>
        <ErrorBox>{err}</ErrorBox>
      </form>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('payroll.period')}</th>
            <th className={thCls}>{t('hr.unit')}</th>
            <th className={`${thCls} text-right`}>{t('hr.employees')}</th>
            <th className={`${thCls} text-right`}>{t('payroll.net')}</th>
            <th className={`${thCls} text-right`}>{t('payroll.totalCost')}</th>
            <th className={thCls}>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/salarios/${r.id}`)}
            >
              <td className={tdCls}>
                {String(r.month).padStart(2, '0')}/{r.year}
              </td>
              <td className={tdCls}>{r.unit.name}</td>
              <td className={`${tdCls} text-right`}>{r._count.lines}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(r.totalNet)}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(r.totalCost)}</td>
              <td className={tdCls}>{t(`payrollStatus.${r.status}` as TKey)}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={6}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
