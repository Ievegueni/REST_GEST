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
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Role } from '../types';

type Rule = {
  type: string;
  enabled: boolean;
  sms: boolean;
  threshold: number | null;
  recipientRoleIds: string[];
};
type Rules = { rules: Rule[]; smsConfigured: boolean };
type Settings = { smsQuietStart: string | null; smsQuietEnd: string | null; smsDigest: boolean };
type SmsLogs = {
  items: {
    id: string;
    to: string;
    message: string;
    status: string;
    error: string | null;
    createdAt: string;
  }[];
};

const THRESHOLD_UNIT: Record<string, TKey> = {
  EXPIRY_NEAR: 'alertRules.days',
  INVENTORY_VARIANCE: 'alertRules.percent',
};

export function AlertSettingsPage() {
  const { data: rules, error } = useApi<Rules>('/alert-rules');
  const { data: roles } = useApi<Role[]>('/roles');
  const { data: settings } = useApi<Settings>('/settings');
  const { data: logs } = useApi<SmsLogs>('/sms-logs');
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!rules || !roles || !settings) return <p className="text-slate-500">{t('common.loading')}</p>;
  return (
    <div className="space-y-6">
      <RulesForm initial={rules} roles={roles} />
      <SmsForm initial={settings} />
      <section className="space-y-2">
        <h2 className="font-medium">{t('sms.log')}</h2>
        <table className={tableCls}>
          <thead className="bg-slate-100">
            <tr>
              <th className={thCls}>{t('common.date')}</th>
              <th className={thCls}>{t('sms.to')}</th>
              <th className={thCls}>{t('alerts.message')}</th>
              <th className={thCls}>{t('sms.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs?.items.map((l) => (
              <tr key={l.id}>
                <td className={`${tdCls} whitespace-nowrap`}>{formatDateTime(l.createdAt)}</td>
                <td className={tdCls}>{l.to}</td>
                <td className={tdCls}>{l.message}</td>
                <td className={tdCls}>
                  {t(`smsStatus.${l.status}` as TKey)}
                  {l.error && <div className="text-xs text-slate-500">{l.error}</div>}
                </td>
              </tr>
            ))}
            {logs?.items.length === 0 && (
              <tr>
                <td className={`${tdCls} text-slate-500`} colSpan={4}>
                  {t('common.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function RulesForm({ initial, roles }: { initial: Rules; roles: Role[] }) {
  const [rules, setRules] = useState(initial.rules);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const set = (i: number, patch: Partial<Rule>) =>
    setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setMsg('');
    setError('');
    try {
      setRules((await api<Rules>('/alert-rules', { method: 'PUT', body: rules })).rules);
      setMsg(t('common.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t('alertRules.title')}</h2>
      {!initial.smsConfigured && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('alertRules.smsNotConfigured')}
        </p>
      )}
      <p className="text-xs text-slate-500">{t('alertRules.recipientsHint')}</p>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('alerts.type')}</th>
            <th className={thCls}>{t('alertRules.enabled')}</th>
            <th className={thCls}>{t('alertRules.sms')}</th>
            <th className={thCls}>{t('alertRules.threshold')}</th>
            <th className={thCls}>{t('alertRules.recipients')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rules.map((r, i) => (
            <tr key={r.type}>
              <td className={tdCls}>{t(`alertType.${r.type}` as TKey)}</td>
              <td className={tdCls}>
                <input
                  type="checkbox"
                  aria-label={`${t('alertRules.enabled')} ${r.type}`}
                  checked={r.enabled}
                  onChange={(e) => set(i, { enabled: e.target.checked })}
                />
              </td>
              <td className={tdCls}>
                <input
                  type="checkbox"
                  aria-label={`${t('alertRules.sms')} ${r.type}`}
                  checked={r.sms}
                  onChange={(e) => set(i, { sms: e.target.checked })}
                />
              </td>
              <td className={tdCls}>
                {THRESHOLD_UNIT[r.type] && (
                  <span className="flex items-center gap-1">
                    <input
                      aria-label={`${t('alertRules.threshold')} ${r.type}`}
                      className={`${inputBase} w-20`}
                      type="number"
                      min={0}
                      step="any"
                      value={r.threshold ?? ''}
                      onChange={(e) =>
                        set(i, { threshold: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    />
                    {t(THRESHOLD_UNIT[r.type]!)}
                  </span>
                )}
              </td>
              <td className={tdCls}>
                <div className="flex flex-wrap gap-x-3">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={r.recipientRoleIds.includes(role.id)}
                        onChange={(e) =>
                          set(i, {
                            recipientRoleIds: e.target.checked
                              ? [...r.recipientRoleIds, role.id]
                              : r.recipientRoleIds.filter((x) => x !== role.id),
                          })
                        }
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      <button className={buttonCls} onClick={save}>
        {t('common.save')}
      </button>
    </section>
  );
}

function SmsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    setMsg('');
    setError('');
    try {
      await api('/settings', {
        method: 'PATCH',
        body: {
          smsQuietStart: s.smsQuietStart ?? '',
          smsQuietEnd: s.smsQuietEnd ?? '',
          smsDigest: s.smsDigest,
        },
      });
      setMsg(t('common.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="max-w-xl space-y-3 rounded-xl border bg-white shadow-xs p-4">
      <h2 className="font-medium">{t('sms.settings')}</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span>{t('sms.quietStart')}</span>
          <input
            className={inputCls}
            type="time"
            value={s.smsQuietStart ?? ''}
            onChange={(e) => setS({ ...s, smsQuietStart: e.target.value || null })}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('sms.quietEnd')}</span>
          <input
            className={inputCls}
            type="time"
            value={s.smsQuietEnd ?? ''}
            onChange={(e) => setS({ ...s, smsQuietEnd: e.target.value || null })}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.smsDigest}
          onChange={(e) => setS({ ...s, smsDigest: e.target.checked })}
        />
        {t('sms.digest')}
      </label>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      <button className={buttonCls} onClick={save}>
        {t('common.save')}
      </button>
    </section>
  );
}
