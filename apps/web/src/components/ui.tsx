import type { ReactNode } from 'react';

export const inputCls = 'w-full rounded border px-3 py-2 text-sm';
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
