import { FEATURES, PLAN_FEATURES } from '@restgest/shared';
import { useSession } from '../../features/session';
import { t, type TKey } from '../../i18n';

export function PlanPage() {
  const { session } = useSession();
  if (!session) return null;
  const active = new Set(session.features);

  const status = (f: (typeof FEATURES)[number]) => {
    if (active.has(f)) return { label: t('settings.featureActive'), cls: 'text-emerald-700' };
    if (
      session.tenant.plan === 'STOCK' &&
      PLAN_FEATURES.COMPLETO.includes(f) &&
      !PLAN_FEATURES.STOCK.includes(f)
    ) {
      return { label: t('settings.featureLocked'), cls: 'text-amber-700' };
    }
    return { label: t('settings.featureDisabled'), cls: 'text-slate-400' };
  };

  return (
    <div className="max-w-xl">
      <p className="mb-6 text-sm">
        {t('settings.planCurrent')}: <strong>{t(`plan.${session.tenant.plan}` as TKey)}</strong>
      </p>
      <ul className="divide-y rounded-xl border bg-white shadow-xs">
        {FEATURES.map((f) => {
          const s = status(f);
          return (
            <li key={f} className="flex justify-between px-4 py-2 text-sm">
              <span>{t(`feature.${f}` as TKey)}</span>
              <span className={s.cls}>{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
