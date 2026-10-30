import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { useCan, useFeature } from '../../features/session';
import { t } from '../../i18n';

export function SettingsLayout() {
  const units = useCan('units.manage');
  const users = useCan('users.manage');
  const stock = useFeature('stock');
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('nav.settings')}</h1>
      <Tabs
        items={[
          { to: '/definicoes/plano', label: t('settings.plan') },
          ...(units ? [{ to: '/definicoes/unidades', label: t('settings.units') }] : []),
          ...(users ? [{ to: '/definicoes/utilizadores', label: t('settings.users') }] : []),
          ...(stock ? [{ to: '/definicoes/stock', label: t('settings.stock') }] : []),
        ]}
      />
      <Outlet />
    </>
  );
}
