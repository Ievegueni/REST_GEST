import { inputCls } from '../../components/ui';
import { useSession } from '../../features/session';
import { t } from '../../i18n';
import { useApi } from '../../lib/useApi';
import type { Unit } from '../types';

export function useUnitChoice(value: string) {
  const { unitId } = useSession();
  const { data } = useApi<Unit[]>('/units');
  const units = data?.filter((u) => u.active) ?? [];
  return { units, unit: value || unitId || units[0]?.id || '' };
}

export function UnitSelect({
  value,
  units,
  onChange,
}: {
  value: string;
  units: Unit[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span>{t('hr.unit')}</span>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
