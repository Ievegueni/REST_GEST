import { useState } from 'react';
import { FormDrawer } from '../../components/FormDrawer';
import { buttonCls, ErrorBox, Inactive, inputCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

type Method = { id: string; name: string; isCash: boolean; active: boolean };

export function CashSettingsPage() {
  const manage = useCan('settings.manage');
  const { data: methods, reload } = useApi<Method[]>('/payment-methods');
  const { data: settings } = useApi<{ cashDifferenceLimit: number | null }>('/settings');
  const [editing, setEditing] = useState<Method | 'new' | null>(null);
  return (
    <div className="max-w-xl space-y-6">
      <section className="space-y-2">
        <h2 className="font-medium">{t('cash.methods')}</h2>
        <ul className="divide-y rounded border bg-white text-sm">
          {methods?.map((m) => (
            <li key={m.id} className="flex justify-between px-4 py-2">
              <span>
                {m.name}
                {m.isCash && (
                  <span className="ml-2 text-xs text-slate-500">({t('cash.isCash')})</span>
                )}
                <Inactive active={m.active} />
              </span>
              {manage && (
                <button className="text-slate-500 hover:underline" onClick={() => setEditing(m)}>
                  {t('common.edit')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {manage && (
          <button className={buttonCls} onClick={() => setEditing('new')}>
            {t('cash.newMethod')}
          </button>
        )}
      </section>
      {settings && (
        <LimitForm
          key={String(settings.cashDifferenceLimit)}
          initial={settings.cashDifferenceLimit}
          manage={manage}
        />
      )}
      {editing && (
        <FormDrawer
          title={t('cash.newMethod')}
          fields={[
            { key: 'name', label: t('hr.name'), required: true },
            { key: 'isCash', label: t('cash.isCash'), type: 'checkbox' },
            { key: 'active', label: t('common.active'), type: 'checkbox' },
          ]}
          initial={editing === 'new' ? { active: true } : editing}
          onSubmit={async (v) => {
            await (editing === 'new'
              ? api('/payment-methods', { body: v })
              : api(`/payment-methods/${editing.id}`, { method: 'PATCH', body: v }));
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LimitForm({ initial, manage }: { initial: number | null; manage: boolean }) {
  const [v, setV] = useState(initial == null ? '' : String(initial));
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  return (
    <section className="space-y-2 rounded border bg-white p-4">
      <label className="block space-y-1 text-sm">
        <span>{t('cash.diffLimit')}</span>
        <input
          className={inputCls}
          type="number"
          min={0}
          step={1}
          disabled={!manage}
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
      </label>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {manage && (
        <button
          className={buttonCls}
          onClick={() =>
            api('/settings', {
              method: 'PATCH',
              body: { cashDifferenceLimit: v === '' ? null : Number(v) },
            }).then(
              () => setMsg(t('common.saved')),
              (e: Error) => setError(e.message),
            )
          }
        >
          {t('common.save')}
        </button>
      )}
    </section>
  );
}
