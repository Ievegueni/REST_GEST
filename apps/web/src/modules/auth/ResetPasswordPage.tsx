import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { t } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { buttonCls, Field } from '../../components/ui';
import { AuthCard } from './AuthCard';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t('auth.passwordMin'));
    if (password !== confirm) return setError(t('auth.passwordMismatch'));
    setError('');
    try {
      await api('/auth/reset-password', { body: { token: params.get('token') ?? '', password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.genericError'));
    }
  };

  return (
    <AuthCard title={t('auth.resetTitle')} onSubmit={submit} error={error}>
      {done ? (
        <p className="text-sm">{t('auth.resetDone')}</p>
      ) : (
        <>
          <Field
            label={t('auth.newPassword')}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <Field
            label={t('auth.confirmPassword')}
            type="password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <button className={`${buttonCls} w-full`}>{t('auth.resetSave')}</button>
        </>
      )}
      <Link to="/login" className="block text-center text-sm text-slate-500 hover:underline">
        {t('auth.backToLogin')}
      </Link>
    </AuthCard>
  );
}
