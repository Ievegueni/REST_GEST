import { useState } from 'react';
import { FormDrawer, type FieldDef, type Values } from '../../components/FormDrawer';
import { buttonCls, ErrorBox, Inactive, tableCls, tdCls, thCls } from '../../components/ui';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Role, Unit, User } from '../types';

export function UsersPage() {
  const { data: users, error, reload } = useApi<User[]>('/users');
  const { data: roles } = useApi<Role[]>('/roles');
  const { data: units } = useApi<Unit[]>('/units');
  const [editing, setEditing] = useState<User | 'new' | null>(null);

  const unitName = new Map(units?.map((u) => [u.id, u.name]));
  const isNew = editing === 'new';

  const fields: FieldDef[] = [
    { key: 'name', label: t('users.name'), required: true },
    ...(isNew
      ? [{ key: 'email', label: t('users.email'), type: 'email' as const, required: true }]
      : []),
    { key: 'phone', label: t('users.phone') },
    {
      key: 'roleId',
      label: t('users.role'),
      type: 'select',
      required: true,
      options: roles?.map((r) => ({ value: r.id, label: r.name })) ?? [],
    },
    { key: 'allUnits', label: t('users.allUnits'), type: 'checkbox' },
    {
      key: 'unitIds',
      label: t('users.units'),
      type: 'checkboxes',
      options: units?.map((u) => ({ value: u.id, label: u.name })) ?? [],
    },
    {
      key: 'password',
      label: isNew ? t('users.password') : t('users.passwordEdit'),
      type: 'password',
      required: isNew,
    },
    { key: 'active', label: t('common.active'), type: 'checkbox' },
  ];

  const save = async (v: Values) => {
    const body: Values = { ...v, unitIds: v.allUnits ? [] : v.unitIds };
    if (!isNew && !body.password) delete body.password;
    await (isNew
      ? api('/users', { body })
      : api(`/users/${(editing as User).id}`, { method: 'PATCH', body }));
    reload();
  };

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <button className={buttonCls} onClick={() => setEditing('new')}>
        {t('users.new')}
      </button>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('users.name')}</th>
            <th className={thCls}>{t('users.role')}</th>
            <th className={thCls}>{t('users.units')}</th>
            <th className={thCls}>{t('users.lastLogin')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users?.map((u) => (
            <tr
              key={u.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => setEditing(u)}
            >
              <td className={tdCls}>
                {u.name}
                <Inactive active={u.active} />
                <div className="text-xs text-slate-500">{u.email}</div>
              </td>
              <td className={tdCls}>{u.role.name}</td>
              <td className={tdCls}>
                {u.allUnits ? t('users.all') : u.unitIds.map((id) => unitName.get(id)).join(', ')}
              </td>
              <td className={tdCls}>
                {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('pt-AO') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && roles && units && (
        <FormDrawer
          title={isNew ? t('users.new') : t('users.edit')}
          fields={fields}
          initial={isNew ? { active: true } : (editing as User)}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
