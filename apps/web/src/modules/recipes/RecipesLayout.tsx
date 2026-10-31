import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { useCan } from '../../features/session';
import { t } from '../../i18n';

export function RecipesLayout() {
  const manage = useCan('recipes.manage');
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t('nav.recipes')}</h1>
      <Tabs
        items={[
          { to: '/fichas', label: t('recipes.items') },
          ...(manage ? [{ to: '/fichas/locais', label: t('recipes.outputLocations') }] : []),
        ]}
      />
      <Outlet />
    </>
  );
}
