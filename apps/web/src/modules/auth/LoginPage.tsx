import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../../features/session';
import { t } from '../../i18n';
import { ApiError } from '../../lib/api';
import { Lock, Mail } from 'lucide-react';
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
    <AuthCard title={t('auth.welcome')} onSubmit={submit} error={error}>
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
      <button className={`${buttonCls} w-full py-2.5 text-base`} disabled={busy}>
        {t('auth.login')}
      </button>
      <Link
        to="/recuperar-senha"
        className="block text-center text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        {t('auth.forgot')}
      </Link>
    </AuthCard>
  );
}
