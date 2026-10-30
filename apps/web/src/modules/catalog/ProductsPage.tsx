import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  buttonCls,
  ErrorBox,
  Inactive,
  inputCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { useApi } from '../../lib/useApi';
import { categoryTree, type Category, type ProductRow } from '../types';

export function ProductsPage() {
  const navigate = useNavigate();
  const manage = useCan('catalog.manage');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const qs = new URLSearchParams({ ...(search && { search }), ...(categoryId && { categoryId }) });
  const { data, error } = useApi<ProductRow[]>(`/products?${qs}`);
  const { data: cats } = useApi<Category[]>('/categories');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inputCls} max-w-xs`}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">
            {t('product.category')}: {t('common.all')}
          </option>
          {categoryTree(cats ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </select>
        {manage && (
          <Link to="/catalogo/produtos/novo" className={`${buttonCls} ml-auto`}>
            {t('product.new')}
          </Link>
        )}
      </div>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('product.code')}</th>
            <th className={thCls}>{t('product.name')}</th>
            <th className={thCls}>{t('product.category')}</th>
            <th className={thCls}>{t('product.stockUnit')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((p) => (
            <tr
              key={p.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/catalogo/produtos/${p.id}`)}
            >
              <td className={`${tdCls} font-mono`}>{p.code}</td>
              <td className={tdCls}>
                {p.name}
                <Inactive active={p.active} />
              </td>
              <td className={tdCls}>{p.category.name}</td>
              <td className={tdCls}>{p.stockUnit.symbol}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={4}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
