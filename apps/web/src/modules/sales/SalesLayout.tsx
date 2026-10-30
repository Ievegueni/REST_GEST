import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { t } from '../../i18n';

export function SalesLayout() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('nav.salesImport')}</h1>
      <Tabs
        items={[
          { to: '/vendas', label: t('sales.imports') },
          { to: '/vendas/mapeamento', label: t('sales.mappings') },
          { to: '/vendas/perfis', label: t('sales.profiles') },
        ]}
      />
      <Outlet />
    </>
  );
}
