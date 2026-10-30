import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../../features/session';
import { t } from '../../i18n';
import { ApiError } from '../../lib/api';
import { buttonCls, Field } from '../../components/ui';
import { AuthCard } from './AuthCard';

export function LoginPage() {
  const { session, login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t('auth.login')} onSubmit={submit} error={error}>
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
      <button className={`${buttonCls} w-full`} disabled={busy}>
        {t('auth.login')}
      </button>
      <Link
        to="/recuperar-senha"
        className="block text-center text-sm text-slate-500 hover:underline"
      >
        {t('auth.forgot')}
      </Link>
    </AuthCard>
  );
}
