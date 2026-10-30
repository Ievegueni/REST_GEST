import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { useCan } from '../../features/session';
import { t } from '../../i18n';

export function CatalogLayout() {
  const manage = useCan('catalog.manage');
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('nav.catalog')}</h1>
      <Tabs
        items={[
          { to: '/catalogo/produtos', label: t('catalog.products') },
          { to: '/catalogo/categorias', label: t('catalog.categories') },
          { to: '/catalogo/unidades-medida', label: t('catalog.measureUnits') },
          ...(manage ? [{ to: '/catalogo/importar', label: t('catalog.import') }] : []),
        ]}
      />
      <Outlet />
    </>
  );
}
