import { useState } from 'react';
import { FormDrawer, type FieldDef, type Values } from '../../components/FormDrawer';
import { buttonCls, ErrorBox, Inactive, secondaryCls } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { StockLocation, Unit } from '../types';

const LOCATION_TYPES = ['WAREHOUSE', 'BAR', 'KITCHEN', 'COLD_ROOM', 'OTHER'] as const;

const unitFields: FieldDef[] = [
  { key: 'name', label: t('units.name'), required: true },
  { key: 'address', label: t('units.address') },
  { key: 'active', label: t('common.active'), type: 'checkbox' },
];
const locationFields: FieldDef[] = [
  { key: 'name', label: t('units.name'), required: true },
  {
    key: 'type',
    label: t('units.locationType'),
    type: 'select',
    required: true,
    options: LOCATION_TYPES.map((v) => ({ value: v, label: t(`locationType.${v}` as TKey) })),
  },
  { key: 'active', label: t('common.active'), type: 'checkbox' },
];

type Editing =
  | { kind: 'unit'; unit?: Unit }
  | { kind: 'location'; unitId: string; location?: StockLocation }
  | null;

export function UnitsPage() {
  const { data: units, error, reload } = useApi<Unit[]>('/units');
  const [editing, setEditing] = useState<Editing>(null);

  const save = async (v: Values) => {
    if (editing?.kind === 'unit') {
      await (editing.unit
        ? api(`/units/${editing.unit.id}`, { method: 'PATCH', body: v })
        : api('/units', { body: v }));
    } else if (editing?.kind === 'location') {
      await (editing.location
        ? api(`/locations/${editing.location.id}`, { method: 'PATCH', body: v })
        : api(`/units/${editing.unitId}/locations`, { body: v }));
    }
    reload();
  };

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <button className={buttonCls} onClick={() => setEditing({ kind: 'unit' })}>
        {t('units.new')}
      </button>
      {units?.map((u) => (
        <section key={u.id} className="rounded-xl border bg-white shadow-xs">
          <header className="flex items-center justify-between border-b px-4 py-2">
            <div>
              <span className="font-medium">{u.name}</span>
              <Inactive active={u.active} />
              {u.address && <span className="ml-2 text-sm text-slate-500">{u.address}</span>}
            </div>
            <div className="flex gap-2">
              <button
                className={secondaryCls}
                onClick={() => setEditing({ kind: 'unit', unit: u })}
              >
                {t('common.edit')}
              </button>
              <button
                className={secondaryCls}
                onClick={() => setEditing({ kind: 'location', unitId: u.id })}
              >
                {t('units.newLocation')}
              </button>
            </div>
          </header>
          <ul className="divide-y text-sm">
            {u.locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-2">
                <span>
                  {l.name}{' '}
                  <span className="text-slate-500">· {t(`locationType.${l.type}` as TKey)}</span>
                  <Inactive active={l.active} />
                </span>
                <button
                  className="text-slate-500 hover:underline"
                  onClick={() => setEditing({ kind: 'location', unitId: u.id, location: l })}
                >
                  {t('common.edit')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing?.kind === 'unit' && (
        <FormDrawer
          title={editing.unit ? t('units.edit') : t('units.new')}
          fields={unitFields}
          initial={editing.unit ?? { active: true }}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'location' && (
        <FormDrawer
          title={editing.location ? t('units.editLocation') : t('units.newLocation')}
          fields={locationFields}
          initial={editing.location ?? { active: true, type: 'WAREHOUSE' }}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
