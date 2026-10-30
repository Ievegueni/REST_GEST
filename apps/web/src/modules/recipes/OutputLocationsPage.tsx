import { useState } from 'react';
import { buttonCls, ErrorBox, inputCls, tableCls, tdCls, thCls } from '../../components/ui';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { categoryTree, type Category, type Unit } from '../types';

type Mapping = { categoryId: string; unitId: string; locationId: string };

export function OutputLocationsPage() {
  const { data: cats } = useApi<Category[]>('/categories');
  const { data: units } = useApi<Unit[]>('/units');
  const { data: maps, error } = useApi<Mapping[]>('/category-output-locations');
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!cats || !units || !maps) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <Matrix cats={cats} units={units.filter((u) => u.active)} maps={maps} />;
}

function Matrix({ cats, units, maps }: { cats: Category[]; units: Unit[]; maps: Mapping[] }) {
  const key = (c: string, u: string) => `${c}|${u}`;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(maps.map((m) => [key(m.categoryId, m.unitId), m.locationId])),
  );
  const [dirty, setDirty] = useState(new Set<string>());
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setMsg('');
    setError('');
    try {
      await api('/category-output-locations', {
        method: 'PUT',
        body: [...dirty].map((k) => {
          const [categoryId, unitId] = k.split('|');
          return { categoryId, unitId, locationId: values[k] || null };
        }),
      });
      setDirty(new Set());
      setMsg(t('common.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('recipes.outputHint')}</p>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('product.category')}</th>
            {units.map((u) => (
              <th key={u.id} className={thCls}>
                {u.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {categoryTree(cats).map((c) => (
            <tr key={c.id}>
              <td className={tdCls} style={{ paddingLeft: 12 + c.depth * 20 }}>
                {c.name}
              </td>
              {units.map((u) => {
                const k = key(c.id, u.id);
                return (
                  <td key={u.id} className={tdCls}>
                    <select
                      aria-label={`${c.name} · ${u.name}`}
                      className={inputCls}
                      value={values[k] ?? ''}
                      onChange={(e) => {
                        setValues({ ...values, [k]: e.target.value });
                        setDirty(new Set(dirty).add(k));
                      }}
                    >
                      <option value="">{t('recipes.inherit')}</option>
                      {u.locations
                        .filter((l) => l.active)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      <button className={buttonCls} disabled={!dirty.size} onClick={save}>
        {t('common.save')}
      </button>
    </div>
  );
}
