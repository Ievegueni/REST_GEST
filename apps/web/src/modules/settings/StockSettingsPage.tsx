import { useState } from 'react';
import { buttonCls, ErrorBox, inputCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

type Settings = { negativeStockPolicy: 'ALLOW' | 'BLOCK' };

export function StockSettingsPage() {
  const { data, error } = useApi<Settings>('/settings');
  return data ? <Form initial={data} /> : <ErrorBox>{error}</ErrorBox>;
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
    <div className="max-w-md space-y-3 rounded border bg-white p-4">
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
