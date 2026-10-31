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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-night-900 bg-[radial-gradient(ellipse_at_center,rgb(79_70_229/0.14),transparent_60%)] px-4 py-12">
      <div className="flex w-full max-w-md min-w-0 flex-col items-center">
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
