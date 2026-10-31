import type { ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';

/** input sem largura (para larguras fixas como w-28) */
export const inputBase =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none disabled:bg-gray-50';
export const inputCls = `${inputBase} w-full`;
export const buttonCls =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-50';

export const secondaryCls =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-xs transition hover:bg-gray-50 disabled:opacity-50';

/** cartão branco base (secções, listas, gráficos) */
export const cardCls = 'rounded-xl border bg-white shadow-xs';

export function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  icon?: LucideIcon;
  placeholder?: string;
}) {
  const Icon = props.icon;
  const required = props.required ?? true;
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-gray-700">
        {props.label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <span className="relative block">
        {Icon && (
          <Icon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-gray-400"
          />
        )}
        <input
          className={`${inputCls} ${Icon ? 'pl-10' : ''} ${props.type === 'email' || props.type === 'password' ? 'py-2.5' : ''}`}
          placeholder={props.placeholder}
          type={props.type ?? 'text'}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          autoComplete={props.autoComplete}
          required={required}
          min={props.type === 'number' ? 0 : undefined}
        />
      </span>
    </label>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return children ? (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {children}
    </p>
  ) : null;
}

export const thCls = 'bg-gray-50 px-4 py-3 text-left';
export const tdCls = 'px-4 py-3';
export const tableCls =
  'w-full border-separate border-spacing-0 overflow-hidden rounded-xl border bg-white text-sm shadow-xs [&_tbody_tr:hover]:bg-gray-50/60 [&_td]:border-t [&_td]:border-gray-100 [&_tbody_tr:first-child_td]:border-t-0 [&_th]:border-b';

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Indicador com ícone num quadrado tingido (painéis). */
export function StatCard(props: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: 'brand' | 'red' | 'amber' | 'emerald';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  const Icon = props.icon;
  return (
    <div
      className={`${cardCls} flex h-full flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-11 ${tones[props.tone ?? 'brand']}`}
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <div className="text-sm leading-snug text-gray-500" title={props.label}>
          {props.label}
        </div>
        <div className="truncate text-xl font-semibold tracking-tight tabular-nums 2xl:text-2xl">
          {props.value}
        </div>
        {props.hint && <div className="mt-0.5 text-xs">{props.hint}</div>}
      </div>
    </div>
  );
}

/** Secção em cartão com título na faixa superior. */
export function Panel(props: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${cardCls} flex flex-col ${props.className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
        <h2 className="text-sm font-semibold">{props.title}</h2>
        {props.action}
      </div>
      <div className="flex-1">{props.children}</div>
    </section>
  );
}

export function Inactive({ active }: { active: boolean }) {
  return active ? null : (
    <span className="ml-2 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
      inactivo
    </span>
  );
}

/** Painel lateral para formulários. */
export function Drawer(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-night-950/40 backdrop-blur-[2px]"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-label={props.title}
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="-mx-6 -mt-6 mb-5 flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{props.title}</h2>
          <button
            onClick={props.onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="size-5" />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

/** Etiqueta de estado (plano, estado, tipo). */
export function Badge({
  tone = 'gray',
  children,
}: {
  tone?: 'gray' | 'brand' | 'emerald' | 'red' | 'amber';
  children: ReactNode;
}) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 ring-gray-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
