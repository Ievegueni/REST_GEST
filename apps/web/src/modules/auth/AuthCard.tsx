import type { FormEvent, ReactNode } from 'react';
import { t } from '../../i18n';

export const inputCls = 'w-full rounded border px-3 py-2 text-sm';
export const buttonCls =
  'w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';

export function AuthCard(props: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={props.onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <div className="text-center text-lg font-semibold">{t('app.name')}</div>
        <h1 className="text-sm text-slate-500">{props.title}</h1>
        {props.error && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {props.error}
          </p>
        )}
        {props.children}
      </form>
    </div>
  );
}

export function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{props.label}</span>
      <input
        className={inputCls}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        required
      />
    </label>
  );
}
