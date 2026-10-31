import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FormDrawer } from '../../components/FormDrawer';
import {
  buttonCls,
  ErrorBox,
  Inactive,
  inputCls,
  PageHeader,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { ProductRow, SupplierDetail } from '../types';
import { supplierFields } from './fields';

type Row = {
  productId: string;
  label: string;
  supplierCode: string;
  lastPrice: string;
  lastPriceAt: string | null;
};

export function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const { data: s, error: loadError, reload } = useApi<SupplierDetail>(`/suppliers/${id}`);

  if (loadError) return <ErrorBox>{loadError}</ErrorBox>;
  if (!s) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <SupplierView key={JSON.stringify(s)} s={s} reload={reload} />;
}

const toRows = (s: SupplierDetail): Row[] =>
  s.products.map((p) => ({
    productId: p.productId,
    label: `${p.product.code} · ${p.product.name}`,
    supplierCode: p.supplierCode ?? '',
    lastPrice: p.lastPrice == null ? '' : String(p.lastPrice),
    lastPriceAt: p.lastPriceAt,
  }));

/** Recriado (key) sempre que os dados do servidor mudam, reiniciando o estado editável. */
function SupplierView({ s, reload }: { s: SupplierDetail; reload: () => void }) {
  const id = s.id;
  const manage = useCan('catalog.manage');
  const { data: products } = useApi<ProductRow[]>(manage ? '/products?active=true' : null);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => toRows(s));
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const available = products?.filter((p) => !rows.some((r) => r.productId === p.id)) ?? [];

  const saveProducts = async () => {
    setError('');
    setMsg('');
    try {
      await api(`/suppliers/${id}/products`, {
        method: 'PUT',
        body: rows.map((r) => ({
          productId: r.productId,
          supplierCode: r.supplierCode,
          lastPrice: r.lastPrice === '' ? null : Number(r.lastPrice),
        })),
      });
      setMsg(t('common.saved'));
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <Link to="/fornecedores" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <PageHeader title={s.name}>
        {manage && (
          <button className={secondaryCls} onClick={() => setEditing(true)}>
            {t('common.edit')}
          </button>
        )}
      </PageHeader>
      <Inactive active={s.active} />
      <dl className="grid gap-x-6 gap-y-1 rounded-xl border bg-white shadow-xs p-4 text-sm md:grid-cols-2">
        {(
          ['nif', 'contactName', 'phone', 'email', 'address', 'paymentTermDays', 'notes'] as const
        ).map((k) => (
          <div key={k} className="flex gap-2">
            <dt className="text-slate-500">{t(`supplier.${k}`)}:</dt>
            <dd>{s[k] ?? '—'}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <h2 className="font-medium">{t('supplier.products')}</h2>
        <ErrorBox>{error}</ErrorBox>
        {msg && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
        <table className={tableCls}>
          <thead className="bg-slate-100">
            <tr>
              <th className={thCls}>{t('product.name')}</th>
              <th className={thCls}>{t('supplier.supplierCode')}</th>
              <th className={thCls}>{t('supplier.lastPrice')}</th>
              <th className={thCls}>{t('supplier.lastPriceAt')}</th>
              {manage && <th className={thCls} />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={r.productId}>
                <td className={tdCls}>{r.label}</td>
                <td className={tdCls}>
                  <input
                    aria-label={t('supplier.supplierCode')}
                    className={inputCls}
                    disabled={!manage}
                    value={r.supplierCode}
                    onChange={(e) => setRow(i, { supplierCode: e.target.value })}
                  />
                </td>
                <td className={tdCls}>
                  <input
                    aria-label={t('supplier.lastPrice')}
                    className={inputCls}
                    type="number"
                    min={0}
                    step={1}
                    disabled={!manage}
                    value={r.lastPrice}
                    onChange={(e) => setRow(i, { lastPrice: e.target.value })}
                  />
                </td>
                <td className={`${tdCls} text-slate-500`}>
                  {r.lastPriceAt ? new Date(r.lastPriceAt).toLocaleDateString('pt-AO') : '—'}
                </td>
                {manage && (
                  <td className={tdCls}>
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      {t('common.remove')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t('supplier.addProduct')}
              className={`${inputCls} max-w-sm`}
              value=""
              onChange={(e) => {
                const p = available.find((x) => x.id === e.target.value);
                if (p)
                  setRows([
                    ...rows,
                    {
                      productId: p.id,
                      label: `${p.code} · ${p.name}`,
                      supplierCode: '',
                      lastPrice: '',
                      lastPriceAt: null,
                    },
                  ]);
              }}
            >
              <option value="">{t('supplier.addProduct')}</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
            <button className={buttonCls} onClick={saveProducts}>
              {t('supplier.saveProducts')}
            </button>
          </div>
        )}
      </section>

      {editing && (
        <FormDrawer
          title={t('supplier.edit')}
          fields={supplierFields}
          initial={s}
          onSubmit={async (v) => {
            await api(`/suppliers/${id}`, { method: 'PATCH', body: v });
            reload();
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
