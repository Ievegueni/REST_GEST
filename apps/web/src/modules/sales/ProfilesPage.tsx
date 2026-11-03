import { useState } from 'react';
import { FormDrawer, type FieldDef, type Values } from '../../components/FormDrawer';
import { buttonCls, ErrorBox, Inactive, tableCls, tdCls, thCls } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Profile } from './types';

const COLS = ['itemCode', 'itemName', 'qty', 'amount', 'date'] as const;

const separators = [
  { value: ',', label: '1.234,56' },
  { value: '.', label: '1,234.56' },
];

const fields: FieldDef[] = [
  { key: 'name', label: t('admin.name'), required: true },
  { key: 'posName', label: t('sales.posName'), required: true },
  { key: 'sheetName', label: t('sales.sheetName') },
  { key: 'headerRow', label: t('sales.headerRow'), type: 'number', required: true },
  { key: 'section', label: t('sales.section') },
  { key: 'groupSection', label: t('sales.groupSection') },
  ...COLS.map((c) => ({
    key: `col_${c}`,
    label: t(`sales.col.${c}` as TKey),
    required: c === 'itemCode' || c === 'qty',
  })),
  {
    key: 'dateFormat',
    label: t('sales.dateFormat'),
    type: 'select',
    required: true,
    options: ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].map((v) => ({ value: v, label: v })),
  },
  {
    key: 'decimalSeparator',
    label: t('sales.decimalSeparator'),
    type: 'select',
    required: true,
    options: separators,
  },
  {
    key: 'amountDecimalSeparator',
    label: t('sales.amountDecimalSeparator'),
    type: 'select',
    options: [{ value: '', label: t('sales.sameAsQty') }, ...separators],
  },
  { key: 'active', label: t('common.active'), type: 'checkbox' },
];

const toValues = (p: Profile): Values => ({
  ...p,
  amountDecimalSeparator: p.amountDecimalSeparator ?? '',
  ...Object.fromEntries(COLS.map((c) => [`col_${c}`, p.columns[c] ?? ''])),
});
const toBody = (v: Values) => ({
  name: v.name,
  posName: v.posName,
  sheetName: v.sheetName,
  headerRow: v.headerRow,
  dateFormat: v.dateFormat,
  decimalSeparator: v.decimalSeparator,
  amountDecimalSeparator: v.amountDecimalSeparator || null,
  section: v.section,
  groupSection: v.groupSection,
  active: v.active,
  columns: Object.fromEntries(COLS.map((c) => [c, v[`col_${c}`] || null])),
});

export function ProfilesPage() {
  const { data, error, reload } = useApi<Profile[]>('/import-profiles');
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <button className={buttonCls} onClick={() => setEditing('new')}>
        {t('sales.newProfile')}
      </button>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('admin.name')}</th>
            <th className={thCls}>{t('sales.posName')}</th>
            <th className={thCls}>{t('sales.col.itemCode')}</th>
            <th className={thCls}>{t('sales.col.qty')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((p) => (
            <tr
              key={p.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => setEditing(p)}
            >
              <td className={tdCls}>
                {p.name}
                <Inactive active={p.active} />
              </td>
              <td className={tdCls}>{p.posName}</td>
              <td className={tdCls}>{p.columns.itemCode}</td>
              <td className={tdCls}>{p.columns.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <FormDrawer
          title={editing === 'new' ? t('sales.newProfile') : t('sales.editProfile')}
          fields={fields}
          initial={
            editing === 'new'
              ? { headerRow: 1, dateFormat: 'DD/MM/YYYY', decimalSeparator: ',', active: true }
              : toValues(editing)
          }
          onSubmit={async (v) => {
            await (editing === 'new'
              ? api('/import-profiles', { body: toBody(v) })
              : api(`/import-profiles/${editing.id}`, { method: 'PUT', body: toBody(v) }));
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
