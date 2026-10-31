import { useState } from 'react';
import { ALERT_TYPES } from '@restgest/shared';
import { ConfirmButton } from '../../components/ConfirmButton';
import {
  ErrorBox,
  inputCls,
  PageHeader,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Alert = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
};

export function AlertsPage() {
  const manage = useCan('alerts.manage');
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [type, setType] = useState('');
  const {
    data,
    error: loadError,
    reload,
  } = useApi<Alert[]>(`/alerts?status=${status}${type ? `&type=${type}` : ''}`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const call = async (path: string) => {
    setError('');
    setBusy(true);
    try {
      await api(path, { method: 'POST' });
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('nav.alerts')}>
        {manage && (
          <button className={secondaryCls} disabled={busy} onClick={() => call('/alerts/sweep')}>
            {t('alerts.sweep')}
          </button>
        )}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {(['OPEN', 'RESOLVED'] as const).map((s) => (
          <button
            key={s}
            className={`${secondaryCls} ${status === s ? 'border-brand-600 bg-brand-50 text-brand-700 hover:bg-brand-50' : ''}`}
            onClick={() => setStatus(s)}
          >
            {t(s === 'OPEN' ? 'alerts.open' : 'alerts.resolved')}
          </button>
        ))}
        <select
          aria-label={t('alerts.type')}
          className={`${inputCls} max-w-xs`}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">{t('alerts.allTypes')}</option>
          {ALERT_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`alertType.${ty}` as TKey)}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox>{error || loadError}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('common.date')}</th>
            <th className={thCls}>{t('alerts.type')}</th>
            <th className={thCls}>{t('alerts.message')}</th>
            {manage && status === 'OPEN' && <th className={thCls} />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((a) => (
            <tr key={a.id}>
              <td className={`${tdCls} whitespace-nowrap`}>
                {formatDateTime(status === 'OPEN' ? a.createdAt : a.resolvedAt)}
              </td>
              <td className={`${tdCls} whitespace-nowrap`}>{t(`alertType.${a.type}` as TKey)}</td>
              <td className={tdCls}>{a.message}</td>
              {manage && status === 'OPEN' && (
                <td className={tdCls}>
                  <ConfirmButton
                    className="text-slate-600 hover:underline"
                    onConfirm={() => call(`/alerts/${a.id}/resolve`)}
                  >
                    {t('alerts.resolve')}
                  </ConfirmButton>
                </td>
              )}
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={4}>
                {t('alerts.none')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
