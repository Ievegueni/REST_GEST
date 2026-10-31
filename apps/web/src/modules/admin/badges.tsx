import { Badge } from '../../components/ui';
import { t, type TKey } from '../../i18n';

export const PlanBadge = ({ plan }: { plan: string }) => (
  <Badge tone={plan === 'COMPLETO' ? 'brand' : 'gray'}>{t(`plan.${plan}` as TKey)}</Badge>
);

export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={status === 'ACTIVE' ? 'emerald' : 'red'}>
    <span
      className={`size-1.5 rounded-full ${status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-red-500'}`}
    />
    {t(`admin.status.${status}` as TKey)}
  </Badge>
);

/** Logotipo do tenant (ou a inicial) em quadrado pequeno, para listas. */
export const TenantMark = ({ name, logoUrl }: { name: string; logoUrl: string | null }) =>
  logoUrl ? (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-white p-1">
      <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
    </span>
  ) : (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
