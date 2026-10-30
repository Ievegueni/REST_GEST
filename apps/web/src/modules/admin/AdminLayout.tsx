import { useEffect, useState, type FormEvent } from 'react';
import { Link, Outlet } from 'react-router-dom';
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
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between bg-slate-900 px-6 text-slate-100">
        <Link to="/admin" className="font-semibold">
          {t('app.name')} · {t('admin.title')}
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/admin" className="hover:underline">
            {t('admin.tenants')}
          </Link>
          <Link to="/admin/tabelas-fiscais" className="hover:underline">
            {t('taxTables.title')}
          </Link>
          <span>{admin.name}</span>
          <button onClick={logout} className="text-slate-400 hover:underline">
            {t('auth.logout')}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
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
    <AuthCard title={t('admin.login')} onSubmit={submit} error={error}>
      <Field
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
      <Field
        label={t('auth.password')}
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      <button className={`${buttonCls} w-full`}>{t('auth.login')}</button>
    </AuthCard>
  );
}
