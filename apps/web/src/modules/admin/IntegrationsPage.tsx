import { useState, type FormEvent } from 'react';
import { KeyRound, MessageSquareText, Send } from 'lucide-react';
import {
  Badge,
  buttonCls,
  ErrorBox,
  Field,
  PageHeader,
  Panel,
  secondaryCls,
} from '../../components/ui';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

type Futurix = {
  url: string;
  sender: string;
  keySet: boolean;
  keyHint: string | null;
  source: 'platform' | 'env' | null;
  configured: boolean;
};
type TestResult = { to: string; ok: boolean; error?: string; providerId?: string | null };

export function IntegrationsPage() {
  const { data, error, setData } = useApi<Futurix>('/admin/integrations/futurix');
  return (
    <div className="space-y-6">
      <PageHeader title={t('integrations.title')} subtitle={t('integrations.subtitle')} />
      <ErrorBox>{error}</ErrorBox>
      {data && <FuturixCard key={JSON.stringify(data)} value={data} onSaved={setData} />}
    </div>
  );
}

function FuturixCard({ value, onSaved }: { value: Futurix; onSaved: (v: Futurix) => void }) {
  const [url, setUrl] = useState(value.url);
  const [sender, setSender] = useState(value.sender);
  const [apiKey, setApiKey] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);

  const save = async (key?: string | null) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const v = await api<Futurix>('/admin/integrations/futurix', {
        method: 'PUT',
        body: { url, sender, ...(key !== undefined && { apiKey: key }) },
      });
      setMsg(t('integrations.saved'));
      onSaved(v);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(apiKey ? apiKey : undefined);
  };
  const sendTest = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setTest(null);
    setErr('');
    try {
      setTest(await api<TestResult>('/admin/integrations/futurix/test', { body: { to: phone } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Panel
        className="xl:col-span-2"
        title={t('integrations.futurix')}
        action={
          value.configured ? (
            <Badge tone="emerald">
              {value.source === 'env' ? t('integrations.viaEnv') : t('integrations.configured')}
            </Badge>
          ) : (
            <Badge tone="amber">{t('integrations.notConfigured')}</Badge>
          )
        }
      >
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="flex gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <MessageSquareText className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <p>{t('integrations.futurixHelp')}</p>
          </div>
          <Field label={t('integrations.url')} value={url} onChange={setUrl} />
          <Field
            label={t('integrations.sender')}
            value={sender}
            onChange={setSender}
            placeholder="RESTOGEST"
          />
          <div className="space-y-1.5">
            <Field
              label={t('integrations.apiKey')}
              type="password"
              required={!value.keySet}
              icon={KeyRound}
              autoComplete="off"
              value={apiKey}
              onChange={setApiKey}
              placeholder={
                value.keySet
                  ? t('integrations.keyKeep', { hint: value.keyHint ?? '' })
                  : t('integrations.keyPaste')
              }
            />
            <p className="text-xs text-gray-500">
              {value.source === 'env'
                ? t('integrations.keyFromEnv')
                : t('integrations.keyEncrypted')}
            </p>
          </div>
          <ErrorBox>{err}</ErrorBox>
          {msg && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {msg}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={buttonCls} disabled={busy}>
              {t('integrations.save')}
            </button>
            {value.source === 'platform' && (
              <button
                type="button"
                className={`${secondaryCls} text-red-600 hover:bg-red-50`}
                disabled={busy}
                onClick={() => save(null)}
              >
                {t('integrations.removeKey')}
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel title={t('integrations.test')}>
        <form onSubmit={sendTest} className="space-y-4 p-5">
          <p className="text-sm text-gray-500">{t('integrations.testHelp')}</p>
          <Field
            label={t('integrations.phone')}
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="923 456 789"
          />
          <button className={`${buttonCls} w-full`} disabled={busy || !value.configured}>
            <Send className="size-4" />
            {t('integrations.sendTest')}
          </button>
          {test && (
            <p
              className={`rounded-lg border px-3 py-2 text-sm ${test.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
            >
              {test.ok
                ? t('integrations.testOk', { to: test.to })
                : t('integrations.testFail', { error: test.error ?? '' })}
            </p>
          )}
        </form>
      </Panel>
    </div>
  );
}
