import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton';
import { FormDrawer } from '../../components/FormDrawer';
import { buttonCls, ErrorBox, inputCls, tableCls, tdCls, thCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Employee } from './types';

type Leave = {
  id: string;
  type: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  startDate: string;
  endDate: string;
  days: number;
  notes: string | null;
  employee: { id: string; name: string; number: string };
};
const TYPES = ['VACATION', 'SICK', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'MARRIAGE', 'OTHER'];

export function LeavesPage() {
  const manage = useCan('hr.manage');
  const [status, setStatus] = useState('');
  const {
    data,
    error: loadError,
    reload,
  } = useApi<Leave[]>(`/leaves${status ? `?status=${status}` : ''}`);
  const { data: employees } = useApi<Employee[]>('/employees?active=true');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const decide = async (id: string, decision: string) => {
    setError('');
    try {
      await api(`/leaves/${id}/decide`, { body: { decision } });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {manage && (
          <button className={buttonCls} onClick={() => setCreating(true)}>
            {t('hr.newLeave')}
          </button>
        )}
        <select
          aria-label={t('common.status')}
          className={`${inputCls} max-w-xs`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('common.all')}</option>
          {['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>
              {t(`leaveStatus.${s}` as TKey)}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox>{error || loadError}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('hr.name')}</th>
            <th className={thCls}>{t('hr.leaveType')}</th>
            <th className={thCls}>{t('hr.start')}</th>
            <th className={thCls}>{t('hr.end')}</th>
            <th className={`${thCls} text-right`}>{t('hr.days')}</th>
            <th className={thCls}>{t('common.status')}</th>
            {manage && <th className={thCls} />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((l) => (
            <tr key={l.id}>
              <td className={tdCls}>{l.employee.name}</td>
              <td className={tdCls}>{t(`leave.${l.type}` as TKey)}</td>
              <td className={tdCls}>{formatDate(l.startDate)}</td>
              <td className={tdCls}>{formatDate(l.endDate)}</td>
              <td className={`${tdCls} text-right`}>{l.days}</td>
              <td className={tdCls}>{t(`leaveStatus.${l.status}` as TKey)}</td>
              {manage && (
                <td className={`${tdCls} whitespace-nowrap`}>
                  {l.status === 'REQUESTED' && (
                    <>
                      <button
                        className="mr-3 text-emerald-700 hover:underline"
                        onClick={() => decide(l.id, 'APPROVED')}
                      >
                        {t('hr.approve')}
                      </button>
                      <button
                        className="mr-3 text-red-700 hover:underline"
                        onClick={() => decide(l.id, 'REJECTED')}
                      >
                        {t('hr.reject')}
                      </button>
                    </>
                  )}
                  {(l.status === 'REQUESTED' || l.status === 'APPROVED') && (
                    <ConfirmButton
                      className="text-slate-500 hover:underline"
                      onConfirm={() => decide(l.id, 'CANCELLED')}
                    >
                      {t('hr.cancelLeave')}
                    </ConfirmButton>
                  )}
                </td>
              )}
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={7}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {creating && (
        <FormDrawer
          title={t('hr.newLeave')}
          fields={[
            {
              key: 'employeeId',
              label: t('hr.name'),
              type: 'select',
              required: true,
              options:
                employees?.map((e) => ({ value: e.id, label: `${e.number} · ${e.name}` })) ?? [],
            },
            {
              key: 'type',
              label: t('hr.leaveType'),
              type: 'select',
              required: true,
              options: TYPES.map((v) => ({ value: v, label: t(`leave.${v}` as TKey) })),
            },
            { key: 'startDate', label: t('hr.start'), type: 'date', required: true },
            { key: 'endDate', label: t('hr.end'), type: 'date', required: true },
            { key: 'notes', label: t('hr.notes'), type: 'textarea' },
          ]}
          initial={{ type: 'VACATION' }}
          onSubmit={async (v) => {
            await api('/leaves', { body: v });
            reload();
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
