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
