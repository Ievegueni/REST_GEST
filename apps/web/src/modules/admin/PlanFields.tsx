import { PLANS, type Plan } from '@restgest/shared';
import { Field } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { LIMIT_KEYS, type Limits } from './types';

export type LimitInputs = Record<keyof Limits, string>;

export const limitsToInputs = (l: Partial<Limits> = {}): LimitInputs =>
  Object.fromEntries(LIMIT_KEYS.map((k) => [k, l[k] == null ? '' : String(l[k])])) as LimitInputs;

/** '' = sem limite (null) */
export const inputsToLimits = (i: LimitInputs): Limits =>
  Object.fromEntries(LIMIT_KEYS.map((k) => [k, i[k] === '' ? null : Number(i[k])])) as Limits;

export function PlanSelector({ value, onChange }: { value: Plan; onChange: (p: Plan) => void }) {
  return (
    <fieldset className="flex gap-2" aria-label={t('admin.plan')}>
      {PLANS.map((p) => (
        <label
          key={p}
          className={`cursor-pointer rounded border px-4 py-2 text-sm ${
            value === p ? 'border-brand-600 bg-brand-600 text-white' : 'bg-white hover:bg-slate-50'
          }`}
        >
          <input
            type="radio"
            name="plan"
            className="sr-only"
            checked={value === p}
            onChange={() => onChange(p)}
          />
          {t(`plan.${p}` as TKey)}
        </label>
      ))}
    </fieldset>
  );
}

export function LimitsFields({
  value,
  onChange,
}: {
  value: LimitInputs;
  onChange: (v: LimitInputs) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {LIMIT_KEYS.map((k) => (
        <Field
          key={k}
          label={t(`admin.${k}` as TKey)}
          type="number"
          required={false}
          value={value[k]}
          onChange={(v) => onChange({ ...value, [k]: v })}
        />
      ))}
    </div>
  );
}
