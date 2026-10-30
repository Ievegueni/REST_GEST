import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormDrawer } from '../../components/FormDrawer';
import {
  buttonCls,
  ErrorBox,
  inputCls,
  PageHeader,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useSession } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { today } from '../hr/types';
import { useUnitChoice } from '../hr/UnitSelect';
import type { Supplier } from '../types';

type Row = {
  id: string;
  documentNumber: string | null;
  description: string | null;
  issueDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  supplier: { name: string };
  unit: { name: string };
  receipt: { number: number } | null;
};

export function PayablesPage() {
  const navigate = useNavigate();
  const { unitId } = useSession();
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [supplierId, setSupplierId] = useState('');
  const qs = new URLSearchParams({
    ...(onlyOpen && { open: 'true' }),
    ...(supplierId && { supplierId }),
    ...(unitId && { unitId }),
  });
  const { data, error, reload } = useApi<Row[]>(`/payables?${qs}`);
  const { data: suppliers } = useApi<Supplier[]>('/suppliers');
  const { units } = useUnitChoice('');
  const [creating, setCreating] = useState(false);
  const now = today();
  const total =
    data?.reduce((s, p) => s + (p.status === 'CANCELLED' ? 0 : p.amount - p.paidAmount), 0) ?? 0;

  return (
    <>
      <PageHeader title={t('nav.payables')}>
        <button className={buttonCls} onClick={() => setCreating(true)}>
          {t('payables.new')}
        </button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
          {t('payables.onlyOpen')}
        </label>
        <select
          aria-label={t('payables.supplier')}
          className={`${inputCls} max-w-xs`}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="">
            {t('payables.supplier')}: {t('common.all')}
          </option>
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="ml-auto font-medium">
          {t('payables.totalOpen', { value: formatMoney(total) })}
        </span>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('payables.dueDate')}</th>
            <th className={thCls}>{t('payables.supplier')}</th>
            <th className={thCls}>{t('payables.document')}</th>
            <th className={thCls}>{t('hr.unit')}</th>
            <th className={`${thCls} text-right`}>{t('payables.amount')}</th>
            <th className={`${thCls} text-right`}>{t('payables.balance')}</th>
            <th className={thCls}>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((p) => {
            const overdue = ['OPEN', 'PARTIAL'].includes(p.status) && p.dueDate.slice(0, 10) < now;
            return (
              <tr
                key={p.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => navigate(`/contas-a-pagar/${p.id}`)}
              >
                <td className={`${tdCls} ${overdue ? 'font-medium text-red-700' : ''}`}>
                  {formatDate(p.dueDate)}
                  {overdue && <span className="ml-1 text-xs">({t('payables.overdue')})</span>}
                </td>
                <td className={tdCls}>{p.supplier.name}</td>
                <td className={tdCls}>
                  {p.documentNumber ??
                    (p.receipt
                      ? t('payables.fromReceipt', { n: p.receipt.number })
                      : p.description)}
                </td>
                <td className={tdCls}>{p.unit.name}</td>
                <td className={`${tdCls} text-right`}>{formatMoney(p.amount)}</td>
                <td className={`${tdCls} text-right`}>{formatMoney(p.amount - p.paidAmount)}</td>
                <td className={tdCls}>{t(`payableStatus.${p.status}` as TKey)}</td>
              </tr>
            );
          })}
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
          title={t('payables.new')}
          fields={[
            {
              key: 'supplierId',
              label: t('payables.supplier'),
              type: 'select',
              required: true,
              options:
                suppliers?.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })) ??
                [],
            },
            {
              key: 'unitId',
              label: t('hr.unit'),
              type: 'select',
              required: true,
              options: units.map((u) => ({ value: u.id, label: u.name })),
            },
            { key: 'documentNumber', label: t('payables.document') },
            { key: 'description', label: t('costs.description') },
            { key: 'issueDate', label: t('payables.issueDate'), type: 'date', required: true },
            { key: 'dueDate', label: t('payables.dueDateHint'), type: 'date' },
            { key: 'amount', label: t('costs.amount'), type: 'number', required: true },
          ]}
          initial={{ issueDate: now, unitId: unitId || units[0]?.id }}
          onSubmit={async (v) => {
            await api('/payables', { body: { ...v, dueDate: v.dueDate || undefined } });
            reload();
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
