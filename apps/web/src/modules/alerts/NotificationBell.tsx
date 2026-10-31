import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
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
        className="relative rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
        onClick={() => setOpen(!open)}
      >
        <Bell className="size-5" strokeWidth={1.75} />
        {!!data?.unread && (
          <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 font-semibold text-white ring-2 ring-white">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
            <span className="font-semibold">{t('alerts.bell')}</span>
            {!!data?.unread && (
              <button className="text-slate-500 hover:underline" onClick={markAll}>
                {t('alerts.markAllRead')}
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y overflow-y-auto text-sm">
            {data?.items.map((n) => (
              <li
                key={n.id}
                className={`flex gap-2.5 px-4 py-3 ${n.readAt ? 'text-gray-500' : ''}`}
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-gray-200' : 'bg-brand-500'}`}
                />
                <div>
                  <div>{n.title}</div>
                  <div className="text-xs text-gray-400">{formatDateTime(n.createdAt)}</div>
                </div>
              </li>
            ))}
            {data?.items.length === 0 && (
              <li className="px-4 py-6 text-center text-gray-500">{t('alerts.noNotifications')}</li>
            )}
          </ul>
          <Link
            to="/alertas"
            className="block border-t px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            {t('alerts.seeAll')}
          </Link>
        </div>
      )}
    </div>
  );
}
