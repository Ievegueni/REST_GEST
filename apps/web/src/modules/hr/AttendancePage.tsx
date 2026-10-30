import { useState } from 'react';
import {
  buttonCls,
  ErrorBox,
  inputBase,
  inputCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { today } from './types';
import { UnitSelect, useUnitChoice } from './UnitSelect';

const STATUSES = ['PRESENT', 'ABSENT_JUSTIFIED', 'ABSENT_UNJUSTIFIED', 'LEAVE', 'DAY_OFF'] as const;
type Status = (typeof STATUSES)[number];
type Row = {
  employee: { id: string; number: string; name: string };
  attendance: {
    status: Status;
    checkIn: string | null;
    checkOut: string | null;
    overtimeMinutes: number;
    notes: string | null;
  } | null;
  shift: { start: string; end: string } | null;
  leave: { type: string } | null;
};
type Summary = {
  employee: { id: string; name: string };
  present: number;
  justified: number;
  unjustified: number;
  dayOff: number;
  leaveDays: number;
  overtimeHours: number;
}[];

export function AttendancePage() {
  const [unitId, setUnitId] = useState('');
  const { units, unit } = useUnitChoice(unitId);
  const [date, setDate] = useState(today());
  const { data, error, reload } = useApi<Row[]>(
    unit ? `/attendance?unitId=${unit}&date=${date}` : null,
  );
  const month = date.slice(0, 7);
  const { data: summary, reload: reloadSummary } = useApi<Summary>(
    unit ? `/attendance/summary?unitId=${unit}&month=${month}` : null,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <UnitSelect value={unit} units={units} onChange={setUnitId} />
        <label className="space-y-1 text-sm">
          <span>{t('common.date')}</span>
          <input
            className={inputCls}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {data && (
        <Sheet
          key={`${unit}|${date}|${JSON.stringify(data)}`}
          unitId={unit}
          date={date}
          rows={data}
          onSaved={() => (reload(), reloadSummary())}
        />
      )}
      {summary && (
        <section className="space-y-2">
          <h2 className="font-medium">
            {t('hr.monthSummary')} {month.split('-').reverse().join('/')}
          </h2>
          <table className={tableCls}>
            <thead className="bg-slate-100">
              <tr>
                <th className={thCls}>{t('hr.name')}</th>
                {(
                  [
                    'present',
                    'justified',
                    'unjustified',
                    'dayOff',
                    'leaveDays',
                    'overtime',
                  ] as const
                ).map((k) => (
                  <th key={k} className={`${thCls} text-right`}>
                    {t(`hr.${k}` as TKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.map((s) => (
                <tr key={s.employee.id}>
                  <td className={tdCls}>{s.employee.name}</td>
                  <td className={`${tdCls} text-right`}>{s.present}</td>
                  <td className={`${tdCls} text-right`}>{s.justified}</td>
                  <td className={`${tdCls} text-right ${s.unjustified ? 'text-red-700' : ''}`}>
                    {s.unjustified}
                  </td>
                  <td className={`${tdCls} text-right`}>{s.dayOff}</td>
                  <td className={`${tdCls} text-right`}>{s.leaveDays}</td>
                  <td className={`${tdCls} text-right`}>{s.overtimeHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Sheet({
  unitId,
  date,
  rows,
  onSaved,
}: {
  unitId: string;
  date: string;
  rows: Row[];
  onSaved: () => void;
}) {
  const manage = useCan('hr.manage');
  // Sugestão inicial: licença aprovada → Licença; turno escalado → Presente; senão Folga.
  const [recs, setRecs] = useState(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.employee.id,
        {
          status: r.attendance?.status ?? (r.leave ? 'LEAVE' : r.shift ? 'PRESENT' : 'DAY_OFF'),
          checkIn: r.attendance?.checkIn ?? '',
          checkOut: r.attendance?.checkOut ?? '',
          overtime: r.attendance ? String(r.attendance.overtimeMinutes / 60) : '0',
          notes: r.attendance?.notes ?? '',
        },
      ]),
    ),
  );
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const set = (id: string, patch: Partial<(typeof recs)[string]>) =>
    setRecs({ ...recs, [id]: { ...recs[id]!, ...patch } });

  const save = async () => {
    setError('');
    setMsg('');
    try {
      await api(`/attendance?unitId=${unitId}`, {
        method: 'PUT',
        body: {
          date,
          records: Object.entries(recs).map(([employeeId, r]) => ({
            employeeId,
            status: r.status,
            checkIn: r.checkIn || null,
            checkOut: r.checkOut || null,
            overtimeMinutes: Math.round(Number(r.overtime || 0) * 60),
            notes: r.notes,
          })),
        },
      });
      setMsg(t('common.saved'));
      onSaved();
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
              <th className={thCls}>{t('hr.shift')}</th>
              <th className={thCls}>{t('hr.status')}</th>
              <th className={thCls}>{t('hr.checkIn')}</th>
              <th className={thCls}>{t('hr.checkOut')}</th>
              <th className={thCls}>{t('hr.overtime')}</th>
              <th className={thCls}>{t('hr.notes')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const v = recs[r.employee.id]!;
              return (
                <tr key={r.employee.id}>
                  <td className={tdCls}>{r.employee.name}</td>
                  <td className={`${tdCls} whitespace-nowrap text-slate-500`}>
                    {r.leave
                      ? t(`leave.${r.leave.type}` as TKey)
                      : r.shift
                        ? `${r.shift.start}–${r.shift.end}`
                        : '—'}
                  </td>
                  <td className={tdCls}>
                    <select
                      aria-label={`${t('hr.status')} ${r.employee.name}`}
                      className={inputCls}
                      disabled={!manage}
                      value={v.status}
                      onChange={(e) => set(r.employee.id, { status: e.target.value as Status })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`att.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <input
                      aria-label={t('hr.checkIn')}
                      className={`${inputBase} w-24`}
                      type="time"
                      disabled={!manage}
                      value={v.checkIn}
                      onChange={(e) => set(r.employee.id, { checkIn: e.target.value })}
                    />
                  </td>
                  <td className={tdCls}>
                    <input
                      aria-label={t('hr.checkOut')}
                      className={`${inputBase} w-24`}
                      type="time"
                      disabled={!manage}
                      value={v.checkOut}
                      onChange={(e) => set(r.employee.id, { checkOut: e.target.value })}
                    />
                  </td>
                  <td className={tdCls}>
                    <input
                      aria-label={t('hr.overtime')}
                      className={`${inputBase} w-20 text-right`}
                      type="number"
                      min={0}
                      step={0.25}
                      disabled={!manage}
                      value={v.overtime}
                      onChange={(e) => set(r.employee.id, { overtime: e.target.value })}
                    />
                  </td>
                  <td className={tdCls}>
                    <input
                      aria-label={t('hr.notes')}
                      className={inputCls}
                      disabled={!manage}
                      value={v.notes}
                      onChange={(e) => set(r.employee.id, { notes: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td className={`${tdCls} text-slate-500`} colSpan={7}>
                  {t('common.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {manage && rows.length > 0 && (
        <button className={buttonCls} onClick={save}>
          {t('common.save')}
        </button>
      )}
    </div>
  );
}
