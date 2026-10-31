import { Outlet } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { t } from '../../i18n';

export function HrLayout() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t('nav.hr')}</h1>
      <Tabs
        items={[
          { to: '/rh', label: t('hr.employees') },
          { to: '/rh/escalas', label: t('hr.schedule') },
          { to: '/rh/presencas', label: t('hr.attendance') },
          { to: '/rh/licencas', label: t('hr.leaves') },
          { to: '/rh/cargos', label: t('hr.positions') },
        ]}
      />
      <Outlet />
    </>
  );
}
