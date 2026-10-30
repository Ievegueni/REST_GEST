import { Link, useNavigate } from 'react-router-dom';
import { buttonCls, ErrorBox, Inactive, tableCls, tdCls, thCls } from '../../components/ui';
import { useCan, useSession } from '../../features/session';
import { t } from '../../i18n';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Employee } from './types';

export function EmployeesPage() {
  const navigate = useNavigate();
  const { unitId } = useSession();
  const manage = useCan('hr.manage');
  const sensitive = useCan('hr.sensitive');
  const { data, error } = useApi<Employee[]>(`/employees${unitId ? `?unitId=${unitId}` : ''}`);
  return (
    <div className="space-y-4">
      {manage && (
        <Link to="/rh/funcionarios/novo" className={buttonCls}>
          {t('hr.newEmployee')}
        </Link>
      )}
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('hr.number')}</th>
            <th className={thCls}>{t('hr.name')}</th>
            <th className={thCls}>{t('hr.unit')}</th>
            <th className={thCls}>{t('hr.position')}</th>
            <th className={thCls}>{t('hr.hireDate')}</th>
            {sensitive && <th className={`${thCls} text-right`}>{t('hr.baseSalary')}</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((e) => (
            <tr
              key={e.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/rh/funcionarios/${e.id}`)}
            >
              <td className={`${tdCls} font-mono`}>{e.number}</td>
              <td className={tdCls}>
                {e.name}
                <Inactive active={e.active} />
              </td>
              <td className={tdCls}>{e.unit?.name}</td>
              <td className={tdCls}>{e.position?.name}</td>
              <td className={tdCls}>{formatDate(e.hireDate)}</td>
              {sensitive && <td className={`${tdCls} text-right`}>{formatMoney(e.baseSalary)}</td>}
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={6}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
