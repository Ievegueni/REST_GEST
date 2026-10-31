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
  const cash = useFeature('cash_closing');
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t('nav.settings')}</h1>
      <Tabs
        items={[
          { to: '/definicoes/plano', label: t('settings.plan') },
          { to: '/definicoes/empresa', label: t('settings.company') },
          ...(units ? [{ to: '/definicoes/unidades', label: t('settings.units') }] : []),
          ...(users ? [{ to: '/definicoes/utilizadores', label: t('settings.users') }] : []),
          ...(stock ? [{ to: '/definicoes/stock', label: t('settings.stock') }] : []),
          ...(alerts ? [{ to: '/definicoes/alertas', label: t('settings.alerts') }] : []),
          ...(payroll ? [{ to: '/definicoes/salarios', label: t('payroll.settings') }] : []),
          ...(cash ? [{ to: '/definicoes/caixa', label: t('cash.settings') }] : []),
        ]}
      />
      <Outlet />
    </>
  );
}
