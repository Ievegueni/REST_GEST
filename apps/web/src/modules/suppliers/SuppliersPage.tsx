import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormDrawer } from '../../components/FormDrawer';
import {
  buttonCls,
  ErrorBox,
  Inactive,
  PageHeader,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Supplier } from '../types';
import { supplierFields } from './fields';

export function SuppliersPage() {
  const navigate = useNavigate();
  const manage = useCan('catalog.manage');
  const { data, error } = useApi<Supplier[]>('/suppliers');
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader title={t('nav.suppliers')}>
        {manage && (
          <button className={buttonCls} onClick={() => setCreating(true)}>
            {t('supplier.new')}
          </button>
        )}
      </PageHeader>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('supplier.name')}</th>
            <th className={thCls}>{t('supplier.nif')}</th>
            <th className={thCls}>{t('supplier.phone')}</th>
            <th className={`${thCls} text-right`}>{t('supplier.paymentTermDays')}</th>
            <th className={`${thCls} text-right`}>{t('supplier.productCount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/fornecedores/${s.id}`)}
            >
              <td className={tdCls}>
                {s.name}
                <Inactive active={s.active} />
              </td>
              <td className={tdCls}>{s.nif}</td>
              <td className={tdCls}>{s.phone}</td>
              <td className={`${tdCls} text-right`}>{s.paymentTermDays}</td>
              <td className={`${tdCls} text-right`}>{s._count?.products}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={5}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {creating && (
        <FormDrawer
          title={t('supplier.new')}
          fields={supplierFields}
          initial={{ active: true, paymentTermDays: 0 }}
          onSubmit={async (v) => {
            const s = await api<Supplier>('/suppliers', { body: v });
            navigate(`/fornecedores/${s.id}`);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
