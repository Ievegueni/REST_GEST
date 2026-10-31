import { useEffect, useState, type FormEvent } from 'react';
import { Outlet } from 'react-router-dom';
import { Building2, Landmark, LayoutDashboard, Lock, Mail } from 'lucide-react';
import { Shell } from '../../components/Shell';
import { buttonCls, Field } from '../../components/ui';
import { t } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { AuthCard } from '../auth/AuthCard';

type Admin = { id: string; name: string; email: string };

/** Área /admin: sessão própria (cookie httpOnly), separada da sessão do tenant. */
export function AdminLayout() {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);

  useEffect(() => {
    api<Admin>('/admin/me')
      .then(setAdmin)
      .catch(() => setAdmin(null));
  }, []);

  if (admin === undefined) return <p className="p-6 text-slate-500">{t('common.loading')}</p>;
  if (!admin) return <AdminLogin onLogin={setAdmin} />;

  const logout = async () => {
    await api('/admin/auth/logout', { method: 'POST' });
    setAdmin(null);
  };

  return (
    <Shell
      brandSubtitle={t('admin.title')}
      footer={t('admin.footer')}
      nav={[
        { to: '/admin', label: t('adminDash.title'), icon: LayoutDashboard, match: [] },
        {
          to: '/admin/tenants',
          label: t('admin.tenants'),
          icon: Building2,
          match: ['/admin/tenants'],
        },
        {
          to: '/admin/tabelas-fiscais',
          label: t('taxTables.title'),
          icon: Landmark,
          match: ['/admin/tabelas-fiscais'],
        },
      ]}
      user={{ name: admin.name, role: t('admin.title') }}
      onLogout={logout}
    >
      <Outlet />
    </Shell>
  );
}

function AdminLogin({ onLogin }: { onLogin: (a: Admin) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      onLogin(await api<Admin>('/admin/auth/login', { body: { email, password } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.genericError'));
    }
  };

  return (
    <AuthCard
      title={t('admin.title')}
      subtitle={t('admin.loginSubtitle')}
      onSubmit={submit}
      error={error}
    >
      <Field
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        icon={Mail}
        placeholder={t('auth.emailPlaceholder')}
      />
      <Field
        label={t('auth.password')}
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        icon={Lock}
        placeholder="••••••••"
      />
      <button className={`${buttonCls} w-full py-2.5 text-base`}>{t('auth.login')}</button>
    </AuthCard>
  );
}
