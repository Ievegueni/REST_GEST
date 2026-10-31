import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  effectiveFeatures,
  FEATURES,
  type Feature,
  type FeatureOverrides,
  type Plan,
} from '@restgest/shared';
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  LogIn,
  MessageSquareText,
  MinusCircle,
  PauseCircle,
  PlayCircle,
  Sparkles,
} from 'lucide-react';
import {
  Badge,
  buttonCls,
  ErrorBox,
  Field,
  inputBase,
  Panel,
  secondaryCls,
  StatCard,
} from '../../components/ui';
import { PlanBadge, StatusBadge } from './badges';
import { useSession } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
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

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(tenant));
  const u = tenant.usage;
  const usd = (v: number) =>
    `${v.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

  return (
    <div className="space-y-6 pb-20">
      <Link
        to="/admin/tenants"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-600"
      >
        <ArrowLeft className="size-4" />
        {t('admin.tenants')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-semibold text-white">
            {tenant.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <PlanBadge plan={tenant.plan} />
              <StatusBadge status={tenant.status} />
              <span>{t('admin.since', { date: formatDate(tenant.createdAt) })}</span>
              {tenant.nif && <span>· NIF {tenant.nif}</span>}
            </div>
          </div>
        </div>
        <button
          className={`${secondaryCls} ${suspended ? '' : 'text-red-600 hover:bg-red-50'}`}
          onClick={() => patch({ status: suspended ? 'ACTIVE' : 'SUSPENDED' })}
        >
          {suspended ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
          {suspended ? t('admin.reactivate') : t('admin.suspend')}
        </button>
      </div>

      <ErrorBox>{error}</ErrorBox>
      {msg && !dirty && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {msg}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-500">{t('admin.usage')}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={MessageSquareText}
            tone="amber"
            label={t('admin.usage.sms')}
            value={String(u.smsSent)}
            hint={
              <span className="text-gray-500">
                {formatMoney(u.smsCost)}
                {tenant.smsMonthlyLimit != null &&
                  ` · ${t('admin.limitOf', { n: tenant.smsMonthlyLimit })}`}
              </span>
            }
          />
          <StatCard
            icon={Sparkles}
            label={t('admin.usage.ai')}
            value={String(u.aiRequests)}
            hint={
              <span className="text-gray-500">
                {u.aiTokens.toLocaleString('pt-AO')} tokens
                {tenant.aiMonthlyLimit != null &&
                  ` · ${t('admin.limitOf', { n: tenant.aiMonthlyLimit })}`}
              </span>
            }
          />
          <StatCard
            icon={CircleDollarSign}
            label={t('admin.usage.aiCost')}
            value={usd(u.aiCostUsd)}
          />
          <StatCard
            icon={FileSpreadsheet}
            tone="emerald"
            label={t('admin.usage.imports')}
            value={String(u.salesImports)}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Panel title={t('admin.plan')}>
            <div className="space-y-5 p-5">
              <PlanSelector value={form.plan} onChange={(plan) => setForm({ ...form, plan })} />
              <div>
                <h3 className="text-sm font-semibold">{t('admin.features')}</h3>
                <p className="mb-2 text-xs text-gray-500">{t('admin.overridesHint')}</p>
                <ul className="divide-y divide-gray-100 rounded-lg border">
                  {FEATURES.map((f) => {
                    const o = form.featureOverrides[f];
                    const on = effective.has(f);
                    return (
                      <li key={f} className="flex items-center gap-3 px-3 py-2 text-sm">
                        {on ? (
                          <CheckCircle2 className="size-4.5 shrink-0 text-emerald-500" />
                        ) : (
                          <MinusCircle className="size-4.5 shrink-0 text-gray-300" />
                        )}
                        <span className={`flex-1 ${on ? '' : 'text-gray-400'}`}>
                          {t(`feature.${f}` as TKey)}
                        </span>
                        {o !== undefined && (
                          <Badge tone={o ? 'emerald' : 'red'}>
                            {o ? t('admin.override.on') : t('admin.override.off')}
                          </Badge>
                        )}
                        <select
                          aria-label={t(`feature.${f}` as TKey)}
                          className={`${inputBase} w-32 py-1`}
                          value={o === undefined ? '' : o ? 'on' : 'off'}
                          onChange={(e) => setOverride(f, e.target.value)}
                        >
                          <option value="">{t('admin.override.plan')}</option>
                          <option value="on">{t('admin.override.on')}</option>
                          <option value="off">{t('admin.override.off')}</option>
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Panel title={t('admin.details')}>
            <div className="space-y-4 p-5">
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
            </div>
          </Panel>
          <Panel title={t('admin.limitsTitle')}>
            <div className="p-5">
              <p className="mb-3 text-xs text-gray-500">{t('admin.limitsHint')}</p>
              <LimitsFields
                value={form.limits}
                onChange={(limits) => setForm({ ...form, limits })}
              />
            </div>
          </Panel>
          <Panel title={t('admin.users')}>
            <ul className="divide-y divide-gray-100 text-sm">
              {tenant.users.map((usr) => (
                <li key={usr.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                    {usr.name
                      .split(' ')
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-medium ${usr.active ? '' : 'text-gray-400'}`}>
                      {usr.name}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {usr.email} · {usr.role.name}
                    </div>
                  </div>
                  {usr.active && !suspended && (
                    <button
                      className={`${secondaryCls} px-2.5 py-1.5 text-xs`}
                      onClick={() => impersonate(usr.id)}
                    >
                      <LogIn className="size-3.5" />
                      {t('admin.impersonate')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1400px] items-center justify-end gap-3 px-4 py-3 sm:px-8">
            <span className="mr-auto text-sm text-gray-600">{t('admin.unsaved')}</span>
            <button className={secondaryCls} onClick={() => setForm(toForm(tenant))}>
              {t('admin.discard')}
            </button>
            <button className={buttonCls} onClick={save}>
              {t('admin.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
