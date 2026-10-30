import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buttonCls,
  ErrorBox,
  inputBase,
  inputCls,
  PageHeader,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { today } from '../hr/types';
import { UnitSelect, useUnitChoice } from '../hr/UnitSelect';

type Row = {
  id: string;
  businessDate: string;
  shift: string;
  status: string;
  openingFloat: number;
  difference: number | null;
  unit: { name: string };
};

export function CashSessionsPage() {
  const navigate = useNavigate();
  const canClose = useCan('cash.close');
  const [unitId, setUnitId] = useState('');
  const { units, unit } = useUnitChoice(unitId);
  const { data, error } = useApi<Row[]>(unit ? `/cash-sessions?unitId=${unit}` : null);
  const [f, setF] = useState({ businessDate: today(), shift: '', openingFloat: '' });
  const [err, setErr] = useState('');

  const open = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const s = await api<{ id: string }>('/cash-sessions', {
        body: { unitId: unit, ...f, openingFloat: Number(f.openingFloat) },
      });
      navigate(`/caixa/${s.id}`);
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  return (
    <>
      <PageHeader title={t('cash.sessions')} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <UnitSelect value={unit} units={units} onChange={setUnitId} />
        {canClose && (
          <form onSubmit={open} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1">
              <span>{t('cash.date')}</span>
              <input
                className={inputCls}
                type="date"
                required
                value={f.businessDate}
                onChange={(e) => setF({ ...f, businessDate: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span>{t('cash.shift')}</span>
              <input
                className={`${inputBase} w-32`}
                value={f.shift}
                onChange={(e) => setF({ ...f, shift: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span>{t('cash.openingFloat')}</span>
              <input
                className={`${inputBase} w-36`}
                type="number"
                min={0}
                step={1}
                required
                value={f.openingFloat}
                onChange={(e) => setF({ ...f, openingFloat: e.target.value })}
              />
            </label>
            <button className={buttonCls} disabled={!unit}>
              {t('cash.open')}
            </button>
          </form>
        )}
      </div>
      <ErrorBox>{err || error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('cash.date')}</th>
            <th className={thCls}>{t('cash.shift')}</th>
            <th className={`${thCls} text-right`}>{t('cash.openingFloat')}</th>
            <th className={`${thCls} text-right`}>{t('cash.difference')}</th>
            <th className={thCls}>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/caixa/${s.id}`)}
            >
              <td className={tdCls}>{formatDate(s.businessDate)}</td>
              <td className={tdCls}>{s.shift || '—'}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(s.openingFloat)}</td>
              <td className={`${tdCls} text-right ${s.difference ? 'text-red-700' : ''}`}>
                {s.difference == null ? '—' : formatMoney(s.difference)}
              </td>
              <td className={tdCls}>{t(`cashStatus.${s.status}` as TKey)}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={5}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
