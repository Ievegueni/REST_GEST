import { useState } from 'react';
import { buttonCls, ErrorBox, inputBase } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

type Settings = { kdsWarnMinutes: number; kdsLateMinutes: number };

/** Definições → Cozinha: minutos de espera para o talão ficar amarelo / vermelho. */
export function KitchenSettingsPage() {
  const { data, error } = useApi<Settings>('/settings');
  return data ? <Form key={JSON.stringify(data)} initial={data} /> : <ErrorBox>{error}</ErrorBox>;
}

function Form({ initial }: { initial: Settings }) {
  const manage = useCan('settings.manage');
  const [v, setV] = useState({
    kdsWarnMinutes: String(initial.kdsWarnMinutes),
    kdsLateMinutes: String(initial.kdsLateMinutes),
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const field = (k: keyof Settings, label: string) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        className={`${inputBase} w-24`}
        disabled={!manage}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </label>
  );
  return (
    <section className="max-w-md space-y-3 rounded-xl border bg-white p-4 shadow-xs">
      <p className="text-sm text-slate-600">{t('kds.settingsHint')}</p>
      {field('kdsWarnMinutes', t('kds.warnMinutes'))}
      {field('kdsLateMinutes', t('kds.lateMinutes'))}
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {manage && (
        <button
          className={buttonCls}
          onClick={async () => {
            setError('');
            setMsg('');
            try {
              await api('/settings', {
                method: 'PATCH',
                body: {
                  kdsWarnMinutes: Number(v.kdsWarnMinutes),
                  kdsLateMinutes: Number(v.kdsLateMinutes),
                },
              });
              setMsg(t('common.saved'));
            } catch (x) {
              setError((x as Error).message);
            }
          }}
        >
          {t('common.save')}
        </button>
      )}
    </section>
  );
}
