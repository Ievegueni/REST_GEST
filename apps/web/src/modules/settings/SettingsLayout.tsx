import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { useCan, useFeature } from '../../features/session';
import { t } from '../../i18n';

export function SettingsLayout() {
  const units = useCan('units.manage');
  const users = useCan('users.manage');
  const stock = useFeature('stock');
  const alertsFeature = useFeature('alerts_sms');
  const alertsManage = useCan('alerts.manage');
  const alerts = alertsFeature && alertsManage;
  const payroll = useFeature('payroll');
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('nav.settings')}</h1>
      <Tabs
        items={[
          { to: '/definicoes/plano', label: t('settings.plan') },
          ...(units ? [{ to: '/definicoes/unidades', label: t('settings.units') }] : []),
          ...(users ? [{ to: '/definicoes/utilizadores', label: t('settings.users') }] : []),
          ...(stock ? [{ to: '/definicoes/stock', label: t('settings.stock') }] : []),
          ...(alerts ? [{ to: '/definicoes/alertas', label: t('settings.alerts') }] : []),
          ...(payroll ? [{ to: '/definicoes/salarios', label: t('payroll.settings') }] : []),
        ]}
      />
      <Outlet />
    </>
  );
}
