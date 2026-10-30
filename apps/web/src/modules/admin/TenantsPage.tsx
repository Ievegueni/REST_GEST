import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonCls, ErrorBox } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import type { TenantRow } from './types';

export function TenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<TenantRow[]>('/admin/tenants')
      .then(setTenants)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('admin.tenants')}</h1>
        <Link to="/admin/tenants/novo" className={buttonCls}>
          {t('admin.newTenant')}
        </Link>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!tenants ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : (
        <table className="w-full rounded border bg-white text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-3 py-2">{t('admin.name')}</th>
              <th className="px-3 py-2">{t('admin.plan')}</th>
              <th className="px-3 py-2">{t('admin.status')}</th>
              <th className="px-3 py-2 text-right">{t('admin.units')}</th>
              <th className="px-3 py-2 text-right">{t('admin.users')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map((tn) => (
              <tr key={tn.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/admin/tenants/${tn.id}`} className="font-medium hover:underline">
                    {tn.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{t(`plan.${tn.plan}` as TKey)}</td>
                <td className={`px-3 py-2 ${tn.status === 'SUSPENDED' ? 'text-red-700' : ''}`}>
                  {t(`admin.status.${tn.status}` as TKey)}
                </td>
                <td className="px-3 py-2 text-right">
                  {tn._count.units}
                  {tn.maxUnits != null && ` / ${tn.maxUnits}`}
                </td>
                <td className="px-3 py-2 text-right">
                  {tn._count.users}
                  {tn.maxUsers != null && ` / ${tn.maxUsers}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
