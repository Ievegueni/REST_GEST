import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { t } from '../../i18n';

export function PurchasesLayout() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('nav.purchases')}</h1>
      <Tabs
        items={[
          { to: '/compras', label: t('purchases.orders') },
          { to: '/compras/recepcoes', label: t('purchases.receipts') },
        ]}
      />
      <Outlet />
    </>
  );
}
