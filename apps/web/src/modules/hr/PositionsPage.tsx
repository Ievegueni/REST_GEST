import { useState } from 'react';
import { FormDrawer } from '../../components/FormDrawer';
import { buttonCls, Inactive } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Department, Position } from './types';

type Editing =
  { kind: 'department'; item?: Department } | { kind: 'position'; item?: Position } | null;

export function PositionsPage() {
  const manage = useCan('hr.manage');
  const { data: departments, reload: reloadD } = useApi<Department[]>('/departments');
  const { data: positions, reload: reloadP } = useApi<Position[]>('/positions');
  const [editing, setEditing] = useState<Editing>(null);

  const list = <T extends { id: string; name: string; active: boolean }>(
    items: T[] | null,
    kind: 'department' | 'position',
    extra?: (i: T) => string | null,
  ) => (
    <ul className="divide-y rounded border bg-white text-sm">
      {items?.map((i) => (
        <li key={i.id} className="flex justify-between px-4 py-2">
          <span>
            {i.name}
            {extra?.(i) && <span className="text-slate-500"> · {extra(i)}</span>}
            <Inactive active={i.active} />
          </span>
          {manage && (
            <button
              className="text-slate-500 hover:underline"
              onClick={() => setEditing({ kind, item: i } as Editing)}
            >
              {t('common.edit')}
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-2">
        <h2 className="font-medium">{t('hr.department')}</h2>
        {manage && (
          <button className={buttonCls} onClick={() => setEditing({ kind: 'department' })}>
            {t('hr.newDepartment')}
          </button>
        )}
        {list(departments, 'department')}
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">{t('hr.position')}</h2>
        {manage && (
          <button className={buttonCls} onClick={() => setEditing({ kind: 'position' })}>
            {t('hr.newPosition')}
          </button>
        )}
        {list(positions, 'position', (p) => p.department?.name ?? null)}
      </section>
      {editing && (
        <FormDrawer
          title={editing.kind === 'department' ? t('hr.newDepartment') : t('hr.newPosition')}
          fields={[
            { key: 'name', label: t('hr.name'), required: true },
            ...(editing.kind === 'position'
              ? [
                  {
                    key: 'departmentId',
                    label: t('hr.department'),
                    type: 'select' as const,
                    options: departments?.map((d) => ({ value: d.id, label: d.name })) ?? [],
                  },
                ]
              : []),
            { key: 'active', label: t('common.active'), type: 'checkbox' },
          ]}
          initial={editing.item ?? { active: true }}
          onSubmit={async (v) => {
            const base = editing.kind === 'department' ? '/departments' : '/positions';
            await (editing.item
              ? api(`${base}/${editing.item.id}`, { method: 'PATCH', body: v })
              : api(base, { body: v }));
            if (editing.kind === 'department') reloadD();
            else reloadP();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
