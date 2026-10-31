import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { buttonCls, ErrorBox, inputBase, PageHeader } from '../../components/ui';
import { t } from '../../i18n';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { PlanBadge, StatusBadge, TenantMark } from './badges';
import type { TenantRow } from './types';

/** "3 / 5" com barra de utilização quando há limite. */
function Usage({ used, max }: { used: number; max: number | null }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div className="ml-auto w-20 text-right">
      <span className="tabular-nums">
        {used}
        {max != null && <span className="text-gray-400"> / {max}</span>}
      </span>
      {max != null && (
        <div className="mt-1 h-1 rounded-full bg-gray-100">
          <div
            className={`h-1 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function TenantsPage() {
  const { data: tenants, error } = useApi<TenantRow[]>('/admin/tenants');
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');

  const rows = (tenants ?? []).filter(
    (tn) =>
      (!q || tn.name.toLowerCase().includes(q.toLowerCase()) || (tn.nif ?? '').includes(q)) &&
      (!plan || tn.plan === plan) &&
      (!status || tn.status === status),
  );

  return (
    <>
      <PageHeader title={t('admin.tenants')} subtitle={t('admin.tenantsSubtitle')}>
        <Link to="/admin/tenants/novo" className={buttonCls}>
          <Plus className="size-4" />
          {t('admin.newTenant')}
        </Link>
      </PageHeader>
      <ErrorBox>{error}</ErrorBox>

      <div className="overflow-hidden rounded-xl border bg-white shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">{t('common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputBase} w-full pl-9`}
              placeholder={t('admin.searchTenants')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <select
            aria-label={t('admin.plan')}
            className={`${inputBase} w-40`}
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            <option value="">{t('admin.allPlans')}</option>
            <option value="STOCK">{t('plan.STOCK')}</option>
            <option value="COMPLETO">{t('plan.COMPLETO')}</option>
          </select>
          <select
            aria-label={t('admin.status')}
            className={`${inputBase} w-40`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t('admin.allStatus')}</option>
            <option value="ACTIVE">{t('admin.status.ACTIVE')}</option>
            <option value="SUSPENDED">{t('admin.status.SUSPENDED')}</option>
          </select>
        </div>

        {!tenants ? (
          <p className="p-6 text-gray-500">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-5 py-2.5 text-left">{t('admin.name')}</th>
                  <th className="px-5 py-2.5 text-left">{t('admin.plan')}</th>
                  <th className="px-5 py-2.5 text-left">{t('admin.status')}</th>
                  <th className="px-5 py-2.5 text-right">{t('admin.units')}</th>
                  <th className="px-5 py-2.5 text-right">{t('admin.users')}</th>
                  <th className="px-5 py-2.5 text-left">{t('adminDash.createdAt')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((tn) => (
                  <tr key={tn.id} className="group hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <TenantMark name={tn.name} logoUrl={tn.logoUrl} />
                        <div>
                          <Link
                            to={`/admin/tenants/${tn.id}`}
                            className="font-medium text-gray-900 group-hover:text-brand-600"
                          >
                            {tn.name}
                          </Link>
                          {tn.nif && <div className="text-xs text-gray-500">NIF {tn.nif}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <PlanBadge plan={tn.plan} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={tn.status} />
                    </td>
                    <td className="px-5 py-3">
                      <Usage used={tn._count.units} max={tn.maxUnits} />
                    </td>
                    <td className="px-5 py-3">
                      <Usage used={tn._count.users} max={tn.maxUsers} />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-gray-500">
                      {formatDate(tn.createdAt)}
                    </td>
                    <td className="pr-4">
                      <Link
                        to={`/admin/tenants/${tn.id}`}
                        aria-label={tn.name}
                        className="flex justify-end text-gray-300 group-hover:text-brand-600"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                      {tenants.length ? t('admin.noMatch') : t('admin.noTenants')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {tenants && (
          <div className="border-t px-5 py-2.5 text-xs text-gray-500">
            {t('admin.count', { n: rows.length, total: tenants.length })}
          </div>
        )}
      </div>
    </>
  );
}
