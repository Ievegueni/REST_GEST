import { useState, type FormEvent } from 'react';
import { t } from '../i18n';
import { buttonCls, Drawer, ErrorBox, inputCls } from './ui';

export type Option = { value: string; label: string };
export type FieldDef = {
  key: string;
  label: string;
  type?:
    'text' | 'number' | 'email' | 'password' | 'textarea' | 'select' | 'checkbox' | 'checkboxes';
  options?: Option[];
  required?: boolean;
};
export type Values = Record<string, unknown>;

/**
 * Formulário genérico num painel lateral.
 * Conversões no envio: number '' → null, select '' → null.
 */
export function FormDrawer(props: {
  title: string;
  fields: FieldDef[];
  initial?: Values;
  onSubmit: (values: Values) => Promise<unknown>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of props.fields) {
      const init = props.initial?.[f.key];
      v[f.key] =
        f.type === 'checkbox'
          ? (init ?? false)
          : f.type === 'checkboxes'
            ? (init ?? [])
            : init == null
              ? ''
              : String(init);
    }
    return v;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const out: Values = {};
    for (const f of props.fields) {
      const v = values[f.key];
      out[f.key] =
        (f.type === 'number' || f.type === 'select') && v === ''
          ? null
          : f.type === 'number'
            ? Number(v)
            : v;
    }
    try {
      await props.onSubmit(out);
      props.onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Drawer title={props.title} onClose={props.onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        {props.fields.map((f) => {
          const v = values[f.key];
          if (f.type === 'checkbox') {
            return (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={v as boolean}
                  onChange={(e) => set(f.key, e.target.checked)}
                />
                {f.label}
              </label>
            );
          }
          if (f.type === 'checkboxes') {
            const list = v as string[];
            return (
              <fieldset key={f.key} className="space-y-1 text-sm">
                <legend className="mb-1">{f.label}</legend>
                {f.options?.map((o) => (
                  <label key={o.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={list.includes(o.value)}
                      onChange={(e) =>
                        set(
                          f.key,
                          e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value),
                        )
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </fieldset>
            );
          }
          return (
            <label key={f.key} className="block space-y-1 text-sm">
              <span>
                {f.label}
                {f.required && ' *'}
              </span>
              {f.type === 'select' ? (
                <select
                  className={inputCls}
                  value={v as string}
                  required={f.required}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  className={inputCls}
                  rows={3}
                  value={v as string}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : (
                <input
                  className={inputCls}
                  type={f.type ?? 'text'}
                  step={f.type === 'number' ? 'any' : undefined}
                  min={f.type === 'number' ? 0 : undefined}
                  value={v as string}
                  required={f.required}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </label>
          );
        })}
        <button className={`${buttonCls} w-full`} disabled={busy}>
          {t('common.save')}
        </button>
      </form>
    </Drawer>
  );
}
