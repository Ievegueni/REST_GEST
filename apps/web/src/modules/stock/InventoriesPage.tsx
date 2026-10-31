import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { buttonCls, ErrorBox, inputCls, tableCls, tdCls, thCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { categoryTree, type Category } from '../types';
import { useLocations } from './useLocations';

type Row = {
  id: string;
  number: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
  blocksMovements: boolean;
  location: { name: string; unit: { name: string } };
  category: { name: string } | null;
  _count: { lines: number };
};

export function InventoriesPage() {
  const navigate = useNavigate();
  const canOpen = useCan('inventory.close');
  const { data, error } = useApi<Row[]>('/inventory-counts');
  const { data: cats } = useApi<Category[]>('/categories');
  const { locations } = useLocations();
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [blocks, setBlocks] = useState(false);
  const [openError, setOpenError] = useState('');
  const loc = locations.some((l) => l.id === locationId) ? locationId : (locations[0]?.id ?? '');

  const open = async (e: FormEvent) => {
    e.preventDefault();
    setOpenError('');
    try {
      const c = await api<{ id: string }>('/inventory-counts', {
        body: { locationId: loc, categoryId: categoryId || null, blocksMovements: blocks },
      });
      navigate(`/stock/inventarios/${c.id}`);
    } catch (err) {
      setOpenError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {canOpen && (
        <form
          onSubmit={open}
          className="flex flex-wrap items-end gap-3 rounded-xl border bg-white shadow-xs p-4 text-sm"
        >
          <label className="space-y-1">
            <span>{t('inventory.location')}</span>
            <select
              className={inputCls}
              value={loc}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span>{t('inventory.category')}</span>
            <select
              className={inputCls}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{t('inventory.allCategories')}</option>
              {categoryTree(cats ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.path}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} />
            {t('inventory.blocks')}
          </label>
          <button className={buttonCls} disabled={!loc}>
            {t('inventory.new')}
          </button>
          <ErrorBox>{openError}</ErrorBox>
        </form>
      )}
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('common.number')}</th>
            <th className={thCls}>{t('inventory.location')}</th>
            <th className={thCls}>{t('product.category')}</th>
            <th className={thCls}>{t('common.date')}</th>
            <th className={`${thCls} text-right`}>{t('inventory.lines')}</th>
            <th className={thCls}>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((c) => (
            <tr
              key={c.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/stock/inventarios/${c.id}`)}
            >
              <td className={tdCls}>{c.number}</td>
              <td className={tdCls}>
                {c.location.unit.name} · {c.location.name}
              </td>
              <td className={tdCls}>{c.category?.name ?? t('inventory.allCategories')}</td>
              <td className={tdCls}>{formatDate(c.closedAt ?? c.openedAt)}</td>
              <td className={`${tdCls} text-right`}>{c._count.lines}</td>
              <td className={tdCls}>{t(`inventoryStatus.${c.status}` as TKey)}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={6}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
