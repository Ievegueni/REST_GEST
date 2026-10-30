import { useState } from 'react';
import {
  buttonCls,
  ErrorBox,
  inputBase,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { addDays, mondayOf, today } from './types';
import { UnitSelect, useUnitChoice } from './UnitSelect';

type Week = {
  employees: { id: string; number: string; name: string; position: { name: string } | null }[];
  shifts: { employeeId: string; date: string; start: string; end: string }[];
};
const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export function SchedulePage() {
  const [unitId, setUnitId] = useState('');
  const { units, unit } = useUnitChoice(unitId);
  const [week, setWeek] = useState(mondayOf(today()));
  const { data, error } = useApi<Week>(unit ? `/shifts?unitId=${unit}&weekStart=${week}` : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <UnitSelect value={unit} units={units} onChange={setUnitId} />
        <button className={secondaryCls} onClick={() => setWeek(addDays(week, -7))}>
          {t('hr.prevWeek')}
        </button>
        <span className="pb-2 text-sm font-medium">{t('hr.week', { date: formatDate(week) })}</span>
        <button className={secondaryCls} onClick={() => setWeek(addDays(week, 7))}>
          {t('hr.nextWeek')}
        </button>
      </div>
      <p className="text-xs text-slate-500">{t('hr.shiftHint')}</p>
      <ErrorBox>{error}</ErrorBox>
      {data && (
        <Grid
          key={`${unit}|${week}|${JSON.stringify(data.shifts)}`}
          unitId={unit}
          week={week}
          data={data}
        />
      )}
    </div>
  );
}

function Grid({ unitId, week, data }: { unitId: string; week: string; data: Week }) {
  const manage = useCan('hr.manage');
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const [cells, setCells] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.shifts.map((s) => [`${s.employeeId}|${s.date}`, `${s.start}-${s.end}`]),
    ),
  );
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const save = async () => {
    setError('');
    setMsg('');
    const shifts = [];
    for (const [k, v] of Object.entries(cells)) {
      if (!v.trim()) continue;
      const m = v.replace(/\s/g, '').match(/^(\d{1,2}):?(\d{2})-(\d{1,2}):?(\d{2})$/);
      if (!m) return setError(t('hr.invalidShift', { value: v }));
      const [employeeId, date] = k.split('|');
      const hh = (h: string, mm: string) => `${h.padStart(2, '0')}:${mm}`;
      shifts.push({ employeeId, date, start: hh(m[1]!, m[2]!), end: hh(m[3]!, m[4]!) });
    }
    try {
      await api('/shifts', { method: 'PUT', body: { unitId, weekStart: week, shifts } });
      setMsg(t('common.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead className="bg-slate-100">
            <tr>
              <th className={thCls}>{t('hr.name')}</th>
              {days.map((d, i) => (
                <th key={d} className={thCls}>
                  {WEEKDAYS[i]} {d.slice(8)}/{d.slice(5, 7)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.employees.map((e) => (
              <tr key={e.id}>
                <td className={`${tdCls} whitespace-nowrap`}>
                  {e.name}
                  <div className="text-xs text-slate-500">{e.position?.name}</div>
                </td>
                {days.map((d) => {
                  const k = `${e.id}|${d}`;
                  return (
                    <td key={d} className="px-1 py-1">
                      <input
                        aria-label={`${e.name} ${d}`}
                        className={`${inputBase} w-28 px-1 text-center`}
                        disabled={!manage}
                        placeholder="—"
                        value={cells[k] ?? ''}
                        onChange={(x) => setCells({ ...cells, [k]: x.target.value })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {!data.employees.length && (
              <tr>
                <td className={`${tdCls} text-slate-500`} colSpan={8}>
                  {t('common.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
