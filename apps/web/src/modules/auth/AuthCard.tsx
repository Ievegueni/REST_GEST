import type { FormEvent, ReactNode } from 'react';
import { BrandMark } from '../../components/Shell';
import { ErrorBox } from '../../components/ui';
import { t } from '../../i18n';

/** Ecrã de autenticação: fundo azul-noite, marca no topo, formulário em cartão branco. */
export function AuthCard(props: {
  title: string;
  subtitle?: string;
  onSubmit: (e: FormEvent) => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-night-900 px-4 py-12">
      {/* luz suave atrás do cartão */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/10 blur-3xl"
      />
      <div className="relative flex w-full max-w-md flex-col items-center">
        <BrandMark size="lg" />
        <h1 className="mt-8 text-center text-2xl font-semibold tracking-tight text-white">
          {props.title}
        </h1>
        <p className="mt-1.5 text-center text-sm text-slate-400">
          {props.subtitle ?? t('auth.subtitle')}
        </p>
        <form
          onSubmit={props.onSubmit}
          className="mt-8 w-full space-y-5 rounded-2xl bg-white p-6 shadow-2xl shadow-black/30 sm:p-8"
        >
          <ErrorBox>{props.error}</ErrorBox>
          {props.children}
        </form>
        <p className="mt-8 text-xs text-slate-500">{t('shell.footer')}</p>
      </div>
    </div>
  );
}
