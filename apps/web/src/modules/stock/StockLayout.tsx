import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { useCan } from '../../features/session';
import { t } from '../../i18n';

export function StockLayout() {
  const move = useCan('stock.move');
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('nav.stock')}</h1>
      <Tabs
        items={[
          { to: '/stock', label: t('stock.current') },
          ...(move ? [{ to: '/stock/movimento', label: t('stock.register') }] : []),
        ]}
      />
      <Outlet />
    </>
  );
}
