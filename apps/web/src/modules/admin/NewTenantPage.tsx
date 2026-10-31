import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Plan } from '@restgest/shared';
import { buttonCls, ErrorBox, Field } from '../../components/ui';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { inputsToLimits, LimitsFields, limitsToInputs, PlanSelector } from './PlanFields';

export function NewTenantPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [plan, setPlan] = useState<Plan>('STOCK');
  const [limits, setLimits] = useState(limitsToInputs());
  const [admin, setAdmin] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const tenant = await api<{ id: string }>('/admin/tenants', {
        body: {
          name,
          nif: nif || null,
          plan,
          ...inputsToLimits(limits),
          admin: { ...admin, phone: admin.phone || null },
        },
      });
      navigate(`/admin/tenants/${tenant.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const setA = (k: keyof typeof admin) => (v: string) => setAdmin({ ...admin, [k]: v });

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <Link to="/admin/tenants" className="text-sm font-medium text-gray-500 hover:text-brand-600">
        {t('admin.back')}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t('admin.newTenant')}</h1>
      <ErrorBox>{error}</ErrorBox>

      <section className="space-y-3 rounded-xl border bg-white shadow-xs p-4">
        <Field label={t('admin.name')} value={name} onChange={setName} />
        <Field label={t('admin.nif')} value={nif} onChange={setNif} required={false} />
        <div className="space-y-1 text-sm">
          <span>{t('admin.plan')}</span>
          <PlanSelector value={plan} onChange={setPlan} />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-white shadow-xs p-4">
        <h2 className="font-medium">{t('admin.firstAdmin')}</h2>
        <Field label={t('admin.name')} value={admin.name} onChange={setA('name')} />
        <Field label={t('auth.email')} type="email" value={admin.email} onChange={setA('email')} />
        <Field
          label={t('auth.password')}
          type="password"
          value={admin.password}
          onChange={setA('password')}
          autoComplete="new-password"
        />
        <Field
          label={t('admin.phone')}
          value={admin.phone}
          onChange={setA('phone')}
          required={false}
        />
      </section>

      <section className="space-y-3 rounded-xl border bg-white shadow-xs p-4">
        <h2 className="font-medium">{t('admin.limits')}</h2>
        <LimitsFields value={limits} onChange={setLimits} />
      </section>

      <button className={buttonCls} disabled={busy}>
        {t('admin.create')}
      </button>
    </form>
  );
}
