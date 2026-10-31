import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  effectiveFeatures,
  FEATURES,
  type Feature,
  type FeatureOverrides,
  type Plan,
} from '@restgest/shared';
import { buttonCls, ErrorBox, Field, secondaryCls } from '../../components/ui';
import { useSession } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import {
  inputsToLimits,
  LimitsFields,
  limitsToInputs,
  PlanSelector,
  type LimitInputs,
} from './PlanFields';
import type { TenantDetail } from './types';

type Form = {
  name: string;
  nif: string;
  plan: Plan;
  featureOverrides: FeatureOverrides;
  limits: LimitInputs;
};

const toForm = (tn: TenantDetail): Form => ({
  name: tn.name,
  nif: tn.nif ?? '',
  plan: tn.plan,
  featureOverrides: tn.featureOverrides,
  limits: limitsToInputs(tn),
});

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { startImpersonation } = useSession();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<TenantDetail>(`/admin/tenants/${id}`)
      .then((tn) => {
        setTenant(tn);
        setForm(toForm(tn));
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (!tenant || !form) {
    return error ? (
      <ErrorBox>{error}</ErrorBox>
    ) : (
      <p className="text-slate-500">{t('common.loading')}</p>
    );
  }

  const patch = async (body: object) => {
    setError('');
    setMsg('');
    try {
      const updated = await api<TenantDetail>(`/admin/tenants/${id}`, { method: 'PATCH', body });
      setTenant({ ...tenant, ...updated });
      setMsg(t('admin.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = () =>
    patch({
      name: form.name,
      nif: form.nif || null,
      plan: form.plan,
      featureOverrides: form.featureOverrides,
      ...inputsToLimits(form.limits),
    });

  const setOverride = (f: Feature, v: string) => {
    const next = { ...form.featureOverrides };
    if (v === '') delete next[f];
    else next[f] = v === 'on';
    setForm({ ...form, featureOverrides: next });
  };

  const impersonate = async (userId: string) => {
    try {
      const { accessToken } = await api<{ accessToken: string }>(
        `/admin/tenants/${id}/impersonate`,
        {
          body: { userId },
        },
      );
      await startImpersonation(accessToken);
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const effective = effectiveFeatures(form.plan, form.featureOverrides);
  const suspended = tenant.status === 'SUSPENDED';

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-slate-500 hover:underline">
        {t('admin.back')}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tenant.name}
          {suspended && (
            <span className="ml-2 text-sm text-red-700">({t('admin.status.SUSPENDED')})</span>
          )}
        </h1>
        <button
          className={secondaryCls}
          onClick={() => patch({ status: suspended ? 'ACTIVE' : 'SUSPENDED' })}
        >
          {suspended ? t('admin.reactivate') : t('admin.suspend')}
        </button>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3 rounded-xl border bg-white shadow-xs p-4">
          <h2 className="font-medium">{t('admin.details')}</h2>
          <Field
            label={t('admin.name')}
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
          />
          <Field
            label={t('admin.nif')}
            value={form.nif}
            required={false}
            onChange={(nif) => setForm({ ...form, nif })}
          />
          <h2 className="pt-2 font-medium">{t('admin.limits')}</h2>
          <LimitsFields value={form.limits} onChange={(limits) => setForm({ ...form, limits })} />
        </section>

        <section className="space-y-3 rounded-xl border bg-white shadow-xs p-4">
          <h2 className="font-medium">{t('admin.plan')}</h2>
          <PlanSelector value={form.plan} onChange={(plan) => setForm({ ...form, plan })} />
          <h2 className="pt-2 font-medium">{t('admin.features')}</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {FEATURES.map((f) => {
                const o = form.featureOverrides[f];
                return (
                  <tr key={f}>
                    <td className="py-1">{t(`feature.${f}` as TKey)}</td>
                    <td className="py-1">
                      <select
                        aria-label={t(`feature.${f}` as TKey)}
                        className="rounded border px-1 py-0.5"
                        value={o === undefined ? '' : o ? 'on' : 'off'}
                        onChange={(e) => setOverride(f, e.target.value)}
                      >
                        <option value="">{t('admin.override.plan')}</option>
                        <option value="on">{t('admin.override.on')}</option>
                        <option value="off">{t('admin.override.off')}</option>
                      </select>
                    </td>
                    <td
                      className={`py-1 text-right ${effective.has(f) ? 'text-emerald-700' : 'text-slate-400'}`}
                    >
                      {effective.has(f) ? '✔' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <button className={buttonCls} onClick={save}>
        {t('admin.save')}
      </button>

      <section className="rounded-xl border bg-white shadow-xs p-4">
        <h2 className="mb-2 font-medium">{t('admin.usage')}</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          {(
            [
              ['admin.usage.sms', `${tenant.usage.smsSent} (${formatMoney(tenant.usage.smsCost)})`],
              ['admin.usage.ai', String(tenant.usage.aiRequests)],
              ['admin.usage.aiTokens', tenant.usage.aiTokens.toLocaleString('pt-AO')],
              ['admin.usage.aiCost', `${tenant.usage.aiCostUsd.toFixed(2)} USD`],
              ['admin.usage.imports', String(tenant.usage.salesImports)],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-slate-500">{t(k)}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border bg-white shadow-xs">
        <h2 className="border-b px-4 py-2 font-medium">{t('admin.users')}</h2>
        <ul className="divide-y text-sm">
          {tenant.users.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-4 py-2">
              <span>
                {u.name}{' '}
                <span className="text-slate-500">
                  · {u.email} · {u.role.name}
                </span>
              </span>
              {u.active && !suspended && (
                <button className={secondaryCls} onClick={() => impersonate(u.id)}>
                  {t('admin.impersonate')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
