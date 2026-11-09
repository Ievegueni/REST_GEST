import { useState } from 'react';
import { FormDrawer } from '../../components/FormDrawer';
import { ConfirmButton } from '../../components/ConfirmButton';
import { buttonCls, Inactive, Panel, secondaryCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { UnitSelect, useUnitChoice } from '../hr/UnitSelect';
import type { DiningTable } from './ReceptionPage';

/** Definições → Mesas: mesas de cada unidade, agrupadas por área. */
export function TablesPage() {
  const [unitId, setUnitId] = useState('');
  const { units, unit } = useUnitChoice(unitId);
  // a chave mostrada é só desta unidade
  const changeUnit = (id: string) => (setUnitId(id), setAgentKey(''));
  const { data, reload } = useApi<DiningTable[]>(unit ? `/tables?unitId=${unit}` : null);
  const [editing, setEditing] = useState<{ item?: DiningTable } | null>(null);
  const [range, setRange] = useState(false);
  const canKey = useCan('units.manage');
  const [agentKey, setAgentKey] = useState('');

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <UnitSelect value={unit} units={units} onChange={changeUnit} />
        <button className={buttonCls} onClick={() => setEditing({})}>
          {t('res.newTable')}
        </button>
        <button className={secondaryCls} onClick={() => setRange(true)}>
          {t('res.newRange')}
        </button>
      </div>
      <p className="text-sm text-gray-500">{t('res.tablesHint')}</p>
      <ul className="divide-y rounded-xl border bg-white text-sm shadow-xs">
        {data?.map((x) => (
          <li key={x.id} className="flex justify-between px-4 py-2">
            <span>
              <strong>{x.name}</strong> · {x.seats} {t('res.seats')}
              {x.area && <span className="text-gray-500"> · {x.area}</span>}
              <Inactive active={x.active} />
            </span>
            <button
              className="text-gray-500 hover:underline"
              onClick={() => setEditing({ item: x })}
            >
              {t('common.edit')}
            </button>
          </li>
        ))}
      </ul>
      {canKey && (
        <Panel title={t('res.agentTitle')}>
          <div className="space-y-3 p-5 text-sm">
            <p className="text-gray-600">{t('res.agentHint')}</p>
            {agentKey ? (
              <>
                <code className="block rounded-lg bg-gray-100 p-3 break-all select-all">
                  {agentKey}
                </code>
                <p className="text-amber-700">{t('res.agentKeyOnce')}</p>
              </>
            ) : (
              <ConfirmButton
                className={secondaryCls}
                onConfirm={async () =>
                  setAgentKey(
                    (await api<{ key: string }>(`/units/${unit}/pos-agent-key`, { method: 'POST' }))
                      .key,
                  )
                }
              >
                {t('res.agentGenerate')}
              </ConfirmButton>
            )}
          </div>
        </Panel>
      )}
      {range && (
        <FormDrawer
          title={t('res.newRange')}
          fields={[
            { key: 'from', label: t('res.rangeFrom'), type: 'number', required: true },
            { key: 'to', label: t('res.rangeTo'), type: 'number', required: true },
            { key: 'seats', label: t('res.seatsLabel'), type: 'number', required: true },
            { key: 'area', label: t('res.area') },
          ]}
          onSubmit={async (v) => {
            await api('/tables/range', { body: { ...v, unitId: unit } });
            reload();
          }}
          onClose={() => setRange(false)}
        />
      )}
      {editing && (
        <FormDrawer
          title={editing.item ? editing.item.name : t('res.newTable')}
          fields={[
            { key: 'name', label: t('res.tableName'), required: true },
            { key: 'seats', label: t('res.seatsLabel'), type: 'number', required: true },
            { key: 'area', label: t('res.area') },
            { key: 'active', label: t('common.active'), type: 'checkbox' },
          ]}
          initial={editing.item ?? { active: true }}
          onSubmit={async (v) => {
            await (editing.item
              ? api(`/tables/${editing.item.id}`, { method: 'PATCH', body: v })
              : api('/tables', { body: { ...v, unitId: unit } }));
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
