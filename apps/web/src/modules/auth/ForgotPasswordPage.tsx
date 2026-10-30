import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { AuthCard, buttonCls, Field } from './AuthCard';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/auth/forgot-password', { body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.genericError'));
    }
  };

  return (
    <AuthCard title={t('auth.forgotTitle')} onSubmit={submit} error={error}>
      {sent ? (
        <p className="text-sm">{t('auth.forgotSent')}</p>
      ) : (
        <>
          <Field
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <button className={buttonCls}>{t('auth.forgotSend')}</button>
        </>
      )}
      <Link to="/login" className="block text-center text-sm text-slate-500 hover:underline">
        {t('auth.backToLogin')}
      </Link>
    </AuthCard>
  );
}
