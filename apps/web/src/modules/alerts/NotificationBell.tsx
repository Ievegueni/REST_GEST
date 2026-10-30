import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Data = {
  unread: number;
  items: { id: string; title: string; readAt: string | null; createdAt: string }[];
};

/** Sino da barra de topo: actualiza a cada minuto. */
export function NotificationBell() {
  const { data, reload } = useApi<Data>('/notifications');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  const markAll = async () => {
    await api('/notifications/read', { body: {} });
    reload();
  };

  return (
    <div className="relative">
      <button
        aria-label={t('alerts.bell')}
        className="relative rounded px-2 py-1 hover:bg-slate-100"
        onClick={() => setOpen(!open)}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none stroke-current stroke-2"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" />
        </svg>
        {!!data?.unread && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs text-white">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-96 rounded border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
            <span className="font-medium">{t('alerts.bell')}</span>
            {!!data?.unread && (
              <button className="text-slate-500 hover:underline" onClick={markAll}>
                {t('alerts.markAllRead')}
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y overflow-y-auto text-sm">
            {data?.items.map((n) => (
              <li key={n.id} className={`px-3 py-2 ${n.readAt ? 'text-slate-500' : ''}`}>
                <div>{n.title}</div>
                <div className="text-xs text-slate-400">{formatDateTime(n.createdAt)}</div>
              </li>
            ))}
            {data?.items.length === 0 && (
              <li className="px-3 py-2 text-slate-500">{t('alerts.noNotifications')}</li>
            )}
          </ul>
          <Link
            to="/alertas"
            className="block border-t px-3 py-2 text-center text-sm hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            {t('alerts.seeAll')}
          </Link>
        </div>
      )}
    </div>
  );
}
