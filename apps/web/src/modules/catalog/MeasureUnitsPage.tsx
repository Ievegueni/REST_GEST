import { useState } from 'react';
import { FormDrawer, type Values } from '../../components/FormDrawer';
import { buttonCls, ErrorBox, tableCls, tdCls, thCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { MeasureUnit } from '../types';

export function MeasureUnitsPage() {
  const { data, error, reload } = useApi<MeasureUnit[]>('/measure-units');
  const manage = useCan('catalog.manage');
  const [editing, setEditing] = useState<MeasureUnit | 'new' | null>(null);

  const save = async (v: Values) => {
    await (editing === 'new'
      ? api('/measure-units', { body: v })
      : api(`/measure-units/${(editing as MeasureUnit).id}`, { method: 'PATCH', body: v }));
    reload();
  };

  return (
    <div className="max-w-xl space-y-4">
      <ErrorBox>{error}</ErrorBox>
      {manage && (
        <button className={buttonCls} onClick={() => setEditing('new')}>
          {t('measureUnit.new')}
        </button>
      )}
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('measureUnit.name')}</th>
            <th className={thCls}>{t('measureUnit.symbol')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((u) => (
            <tr
              key={u.id}
              className={manage ? 'cursor-pointer hover:bg-slate-50' : ''}
              onClick={() => manage && setEditing(u)}
            >
              <td className={tdCls}>{u.name}</td>
              <td className={tdCls}>{u.symbol}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <FormDrawer
          title={editing === 'new' ? t('measureUnit.new') : t('measureUnit.edit')}
          fields={[
            { key: 'name', label: t('measureUnit.name'), required: true },
            { key: 'symbol', label: t('measureUnit.symbol'), required: true },
          ]}
          initial={editing === 'new' ? {} : editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
