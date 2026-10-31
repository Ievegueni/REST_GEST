import { useState, type FormEvent } from 'react';
import { FormDrawer } from '../../components/FormDrawer';
import { Tabs } from '../../components/Tabs';
import {
  buttonCls,
  ErrorBox,
  Inactive,
  inputBase,
  inputCls,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { t } from '../../i18n';
import { api, apiOpen, apiUpload } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { UnitSelect, useUnitChoice } from '../hr/UnitSelect';
import { today } from '../hr/types';

type Ref = { id: string; name: string; active: boolean };
type Cost = {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  attachmentUrl: string | null;
  cashSessionId: string | null;
  category: { name: string };
  paymentMethod: { name: string } | null;
  unit: { name: string };
};
type Recurring = {
  id: string;
  unitId: string;
  categoryId: string;
  description: string;
  amount: number;
  dayOfMonth: number;
  active: boolean;
  category: { name: string };
  unit: { name: string };
};

export function CostsLayoutTabs() {
  return (
    <Tabs
      items={[
        { to: '/custos', label: t('costs.daily') },
        { to: '/custos/recorrentes', label: t('costs.recurring') },
        { to: '/custos/categorias', label: t('costs.categories') },
      ]}
    />
  );
}

export function DailyCostsPage() {
  const [unitId, setUnitId] = useState('');
  const { units, unit } = useUnitChoice(unitId);
  const [month, setMonth] = useState(today().slice(0, 7));
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const { data, error, reload } = useApi<Cost[]>(
    unit ? `/daily-costs?unitId=${unit}&from=${month}-01&to=${last}` : null,
  );
  const { data: cats } = useApi<Ref[]>('/cost-categories');
  const { data: methods } = useApi<Ref[]>('/payment-methods');
  const [f, setF] = useState({
    date: today(),
    categoryId: '',
    description: '',
    amount: '',
    paymentMethodId: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const att = file ? await apiUpload<{ url: string; name: string }>('/uploads', file) : null;
      await api('/daily-costs', {
        body: {
          ...f,
          unitId: unit,
          amount: Number(f.amount),
          paymentMethodId: f.paymentMethodId || null,
          attachmentUrl: att?.url ?? null,
          attachmentName: att?.name ?? null,
        },
      });
      setF({ ...f, description: '', amount: '' });
      setFile(null);
      reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const total = data?.reduce((s, c) => s + c.amount, 0) ?? 0;

  return (
    <div className="space-y-4">
      <CostsLayoutTabs />
      <div className="flex flex-wrap items-end gap-3">
        <UnitSelect value={unit} units={units} onChange={setUnitId} />
        <label className="space-y-1 text-sm">
          <span>{t('costs.month')}</span>
          <input
            className={inputCls}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <span className="ml-auto pb-2 text-sm font-medium">
          {t('common.total')}: {formatMoney(total)}
        </span>
      </div>
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-2 rounded-xl border bg-white shadow-xs p-3 text-sm"
      >
        <input
          aria-label={t('costs.date')}
          className={`${inputBase} w-40`}
          type="date"
          required
          value={f.date}
          onChange={(e) => setF({ ...f, date: e.target.value })}
        />
        <select
          aria-label={t('costs.category')}
          className={`${inputBase} w-44`}
          required
          value={f.categoryId}
          onChange={(e) => setF({ ...f, categoryId: e.target.value })}
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
        <input
          aria-label={t('costs.description')}
          placeholder={t('costs.description')}
          className={`${inputCls} max-w-xs`}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
        <input
          aria-label={t('costs.amount')}
          placeholder={t('costs.amount')}
          className={`${inputBase} w-32`}
          type="number"
          min={1}
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
          aria-label={t('costs.receipt')}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button className={buttonCls} disabled={!unit}>
          {t('costs.new')}
        </button>
      </form>
      <ErrorBox>{err || error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('costs.date')}</th>
            <th className={thCls}>{t('costs.category')}</th>
            <th className={thCls}>{t('costs.description')}</th>
            <th className={thCls}>{t('costs.paymentMethod')}</th>
            <th className={`${thCls} text-right`}>{t('costs.amount')}</th>
            <th className={thCls} />
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((c) => (
            <tr key={c.id}>
              <td className={tdCls}>{formatDate(c.date)}</td>
              <td className={tdCls}>{c.category.name}</td>
              <td className={tdCls}>
                {c.description}
                {c.cashSessionId && (
                  <span className="ml-2 text-xs text-slate-500">({t('costs.fromCash')})</span>
                )}
              </td>
              <td className={tdCls}>{c.paymentMethod?.name}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(c.amount)}</td>
              <td className={`${tdCls} whitespace-nowrap`}>
                {c.attachmentUrl && (
                  <button
                    className="mr-3 text-blue-700 hover:underline"
                    onClick={() => apiOpen(c.attachmentUrl!).catch((x: Error) => setErr(x.message))}
                  >
                    {t('costs.viewReceipt')}
                  </button>
                )}
                {!c.cashSessionId && (
                  <button
                    className="text-red-600 hover:underline"
                    onClick={() =>
                      api(`/daily-costs/${c.id}`, { method: 'DELETE' }).then(reload, (x: Error) =>
                        setErr(x.message),
                      )
                    }
                  >
                    {t('common.remove')}
                  </button>
                )}
              </td>
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
    </div>
  );
}

export function RecurringCostsPage() {
  const { data, reload } = useApi<Recurring[]>('/recurring-costs');
  const { data: cats } = useApi<Ref[]>('/cost-categories');
  const { units } = useUnitChoice('');
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const [msg, setMsg] = useState('');
  return (
    <div className="space-y-4">
      <CostsLayoutTabs />
      <div className="flex gap-2">
        <button className={buttonCls} onClick={() => setEditing('new')}>
          {t('costs.newRecurring')}
        </button>
        <button
          className={secondaryCls}
          onClick={async () =>
            setMsg(
              t('costs.generated', {
                n: (
                  await api<{ generated: number }>('/recurring-costs/generate', { method: 'POST' })
                ).generated,
              }),
            )
          }
        >
          {t('costs.generate')}
        </button>
        {msg && <span className="self-center text-sm text-emerald-700">{msg}</span>}
      </div>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('costs.description')}</th>
            <th className={thCls}>{t('hr.unit')}</th>
            <th className={thCls}>{t('costs.category')}</th>
            <th className={thCls}>{t('costs.dayOfMonth')}</th>
            <th className={`${thCls} text-right`}>{t('costs.amount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => setEditing(r)}
            >
              <td className={tdCls}>
                {r.description}
                <Inactive active={r.active} />
              </td>
              <td className={tdCls}>{r.unit.name}</td>
              <td className={tdCls}>{r.category.name}</td>
              <td className={tdCls}>{r.dayOfMonth}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <FormDrawer
          title={t('costs.newRecurring')}
          fields={[
            { key: 'description', label: t('costs.description'), required: true },
            {
              key: 'unitId',
              label: t('hr.unit'),
              type: 'select',
              required: true,
              options: units.map((u) => ({ value: u.id, label: u.name })),
            },
            {
              key: 'categoryId',
              label: t('costs.category'),
              type: 'select',
              required: true,
              options:
                cats?.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name })) ?? [],
            },
            { key: 'amount', label: t('costs.amount'), type: 'number', required: true },
            { key: 'dayOfMonth', label: t('costs.dayOfMonth'), type: 'number', required: true },
            { key: 'active', label: t('common.active'), type: 'checkbox' },
          ]}
          initial={editing === 'new' ? { active: true, dayOfMonth: 1 } : editing}
          onSubmit={async (v) => {
            await (editing === 'new'
              ? api('/recurring-costs', { body: v })
              : api(`/recurring-costs/${editing.id}`, { method: 'PUT', body: v }));
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export function CostCategoriesPage() {
  const { data, reload } = useApi<Ref[]>('/cost-categories');
  const [editing, setEditing] = useState<Ref | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <CostsLayoutTabs />
      <button className={buttonCls} onClick={() => setEditing('new')}>
        {t('costs.newCategory')}
      </button>
      <ul className="max-w-md divide-y rounded-xl border bg-white shadow-xs text-sm">
        {data?.map((c) => (
          <li key={c.id} className="flex justify-between px-4 py-2">
            <span>
              {c.name}
              <Inactive active={c.active} />
            </span>
            <button className="text-slate-500 hover:underline" onClick={() => setEditing(c)}>
              {t('common.edit')}
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <FormDrawer
          title={t('costs.newCategory')}
          fields={[
            { key: 'name', label: t('hr.name'), required: true },
            { key: 'active', label: t('common.active'), type: 'checkbox' },
          ]}
          initial={editing === 'new' ? { active: true } : editing}
          onSubmit={async (v) => {
            await (editing === 'new'
              ? api('/cost-categories', { body: v })
              : api(`/cost-categories/${editing.id}`, { method: 'PATCH', body: v }));
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
