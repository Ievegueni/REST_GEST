import { useState } from 'react';
import { FormDrawer, type Values } from '../../components/FormDrawer';
import { buttonCls, ErrorBox, Inactive } from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { categoryTree, type Category } from '../types';

export function CategoriesPage() {
  const { data, error, reload } = useApi<Category[]>('/categories');
  const manage = useCan('catalog.manage');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const tree = categoryTree(data ?? []);

  // Uma categoria não pode ficar debaixo de si própria nem de descendentes.
  const parentOptions = (self?: Category) => {
    const excluded = new Set<string>();
    if (self) {
      const selfPath = tree.find((c) => c.id === self.id)!.path;
      tree.forEach(
        (c) => (c.path === selfPath || c.path.startsWith(`${selfPath} > `)) && excluded.add(c.id),
      );
    }
    return tree.filter((c) => !excluded.has(c.id)).map((c) => ({ value: c.id, label: c.path }));
  };

  const save = async (v: Values) => {
    await (editing === 'new'
      ? api('/categories', { body: v })
      : api(`/categories/${(editing as Category).id}`, { method: 'PATCH', body: v }));
    reload();
  };

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      {manage && (
        <button className={buttonCls} onClick={() => setEditing('new')}>
          {t('category.new')}
        </button>
      )}
      <ul className="divide-y rounded border bg-white text-sm">
        {tree.map((c) => (
          <li
            key={c.id}
            className="flex justify-between px-4 py-2"
            style={{ paddingLeft: 16 + c.depth * 24 }}
          >
            <span>
              {c.name}
              <Inactive active={c.active} />
            </span>
            {manage && (
              <button className="text-slate-500 hover:underline" onClick={() => setEditing(c)}>
                {t('common.edit')}
              </button>
            )}
          </li>
        ))}
        {data?.length === 0 && <li className="px-4 py-2 text-slate-500">{t('common.empty')}</li>}
      </ul>
      {editing && (
        <FormDrawer
          title={editing === 'new' ? t('category.new') : t('category.edit')}
          fields={[
            { key: 'name', label: t('category.name'), required: true },
            {
              key: 'parentId',
              label: t('category.parent'),
              type: 'select',
              options: parentOptions(editing === 'new' ? undefined : editing),
            },
            { key: 'active', label: t('common.active'), type: 'checkbox' },
          ]}
          initial={editing === 'new' ? { active: true } : editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
