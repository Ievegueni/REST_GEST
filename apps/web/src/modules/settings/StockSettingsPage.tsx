import { useState } from 'react';
import { buttonCls, ErrorBox, inputCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

type Settings = { negativeStockPolicy: 'ALLOW' | 'BLOCK' };

export function StockSettingsPage() {
  const { data, error } = useApi<Settings>('/settings');
  return (
    <div className="space-y-6">
      {data ? <Form initial={data} /> : <ErrorBox>{error}</ErrorBox>}
      <WasteReasons />
    </div>
  );
}

type Reason = { id: string; name: string; active: boolean };

function WasteReasons() {
  const manage = useCan('settings.manage');
  const { data, reload } = useApi<Reason[]>('/waste-reasons');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const call = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="max-w-md space-y-3 rounded-xl border bg-white shadow-xs p-4">
      <h2 className="font-medium">{t('wasteReasons.title')}</h2>
      <p className="text-xs text-slate-500">{t('wasteReasons.hint')}</p>
      <ul className="divide-y text-sm">
        {data?.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-1">
            <span className={r.active ? '' : 'text-slate-400 line-through'}>{r.name}</span>
            {manage && (
              <input
                type="checkbox"
                aria-label={`${t('common.active')} ${r.name}`}
                checked={r.active}
                onChange={(e) =>
                  call(() =>
                    api(`/waste-reasons/${r.id}`, {
                      method: 'PATCH',
                      body: { active: e.target.checked },
                    }),
                  )
                }
              />
            )}
          </li>
        ))}
      </ul>
      {manage && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void call(async () => {
              await api('/waste-reasons', { body: { name } });
              setName('');
            });
          }}
        >
          <input
            className={inputCls}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className={buttonCls}>{t('common.add')}</button>
        </form>
      )}
      <ErrorBox>{error}</ErrorBox>
    </section>
  );
}

function Form({ initial }: { initial: Settings }) {
  const manage = useCan('settings.manage');
  const [policy, setPolicy] = useState(initial.negativeStockPolicy);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setMsg('');
    setError('');
    try {
      await api('/settings', { method: 'PATCH', body: { negativeStockPolicy: policy } });
      setMsg(t('common.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-md space-y-3 rounded-xl border bg-white shadow-xs p-4">
      <label className="block space-y-1 text-sm">
        <span>{t('settings.negativeStock')}</span>
        <select
          className={inputCls}
          disabled={!manage}
          value={policy}
          onChange={(e) => setPolicy(e.target.value as Settings['negativeStockPolicy'])}
        >
          {(['ALLOW', 'BLOCK'] as const).map((p) => (
            <option key={p} value={p}>
              {t(`settings.negativeStock.${p}` as TKey)}
            </option>
          ))}
        </select>
      </label>
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
