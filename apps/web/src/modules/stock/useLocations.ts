import { useSession } from '../../features/session';
import { useApi } from '../../lib/useApi';
import type { Unit } from '../types';

/** Locais activos das unidades acessíveis, filtrados pela unidade escolhida no topo. */
export function useLocations() {
  const { unitId } = useSession();
  const { data: units } = useApi<Unit[]>('/units');
  const locations =
    units
      ?.filter((u) => u.active && (!unitId || u.id === unitId))
      .flatMap((u) =>
        u.locations.filter((l) => l.active).map((l) => ({ ...l, label: `${u.name} · ${l.name}` })),
      ) ?? [];
  return { locations, unitId, loaded: units !== null };
}
