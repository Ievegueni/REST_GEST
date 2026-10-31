import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { useCan } from '../../features/session';
import { t } from '../../i18n';

export function StockLayout() {
  const move = useCan('stock.move');
  const transfers = useCan('transfers.manage');
  const inventory = useCan('inventory.count');
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t('nav.stock')}</h1>
      <Tabs
        items={[
          { to: '/stock', label: t('stock.current') },
          ...(move ? [{ to: '/stock/movimento', label: t('stock.register') }] : []),
          ...(transfers ? [{ to: '/stock/transferencias', label: t('transfers.title') }] : []),
          ...(inventory ? [{ to: '/stock/inventarios', label: t('inventory.title') }] : []),
        ]}
      />
      <Outlet />
    </>
  );
}
