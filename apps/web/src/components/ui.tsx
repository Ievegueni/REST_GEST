import type { ReactNode } from 'react';

/** input sem largura (para larguras fixas como w-28) */
export const inputBase = 'rounded border px-3 py-2 text-sm';
export const inputCls = `${inputBase} w-full`;
export const buttonCls =
  'rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';

export const secondaryCls =
  'rounded border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50';

export function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
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
        required={props.required ?? true}
        min={props.type === 'number' ? 0 : undefined}
      />
    </label>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  ) : null;
}

export const thCls = 'px-3 py-2 text-left font-medium';
export const tdCls = 'px-3 py-2';
export const tableCls = 'w-full rounded border bg-white text-sm';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Inactive({ active }: { active: boolean }) {
  return active ? null : (
    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">inactivo</span>
  );
}

/** Painel lateral para formulários. */
export function Drawer(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={props.onClose}>
      <div
        role="dialog"
        aria-label={props.title}
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{props.title}</h2>
          <button onClick={props.onClose} aria-label="Fechar" className="text-xl text-slate-400">
            ×
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}
