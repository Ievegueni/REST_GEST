import { PLAN_FEATURES, PLANS, type Plan } from '@restgest/shared';
import { CheckCircle2, Package, Sparkles } from 'lucide-react';
import { Field } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { LIMIT_KEYS, type Limits } from './types';

export type LimitInputs = Record<keyof Limits, string>;

export const limitsToInputs = (l: Partial<Limits> = {}): LimitInputs =>
  Object.fromEntries(LIMIT_KEYS.map((k) => [k, l[k] == null ? '' : String(l[k])])) as LimitInputs;

/** '' = sem limite (null) */
export const inputsToLimits = (i: LimitInputs): Limits =>
  Object.fromEntries(LIMIT_KEYS.map((k) => [k, i[k] === '' ? null : Number(i[k])])) as Limits;

/** Selector de plano em cartões: o "botão" que define o que o cliente contratou. */
export function PlanSelector({ value, onChange }: { value: Plan; onChange: (p: Plan) => void }) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2" aria-label={t('admin.plan')}>
      {PLANS.map((p) => {
        const on = value === p;
        const Icon = p === 'COMPLETO' ? Sparkles : Package;
        return (
          <label
            key={p}
            className={`relative flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
              on
                ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="plan"
              className="sr-only"
              checked={on}
              onChange={() => onChange(p)}
            />
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              <Icon className="size-4.5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold">
                {t(`plan.${p}` as TKey)}
                <span className="text-xs font-normal text-gray-500">
                  {t('plan.featureCount', { n: PLAN_FEATURES[p].length })}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                {t(`plan.desc.${p}` as TKey)}
              </span>
            </span>
            {on && <CheckCircle2 className="absolute top-3 right-3 size-5 text-brand-600" />}
          </label>
        );
      })}
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
