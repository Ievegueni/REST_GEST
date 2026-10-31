import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmButton } from '../../components/ConfirmButton';
import { productLabel } from '../../components/ProductLines';
import { ErrorBox, secondaryCls, tableCls, tdCls, thCls } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api, apiOpen } from '../../lib/api';
import { formatDate, formatDateTime, formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Receipt } from './types';

export function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error: loadError, reload } = useApi<Receipt>(`/goods-receipts/${id}`);
  const [error, setError] = useState('');
  if (loadError) return <ErrorBox>{loadError}</ErrorBox>;
  if (!r) return <p className="text-slate-500">{t('common.loading')}</p>;

  const cancel = async () => {
    try {
      await api(`/goods-receipts/${id}/cancel`, { method: 'POST' });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-5xl space-y-4">
      <Link to="/compras/recepcoes" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {t('purchases.receipt', { n: r.number })}
        <span
          className={`ml-2 text-sm ${r.status === 'CANCELLED' ? 'text-red-700' : 'text-slate-500'}`}
        >
          ({t(`docStatus.${r.status}` as TKey)})
        </span>
      </h2>
      <dl className="grid gap-1 rounded-xl border bg-white shadow-xs p-4 text-sm md:grid-cols-2">
        <div>
          <dt className="inline text-slate-500">{t('purchases.supplier')}: </dt>
          <dd className="inline">{r.supplier.name}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">{t('purchases.location')}: </dt>
          <dd className="inline">
            {r.location.unit.name} · {r.location.name}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-500">{t('purchases.receivedAt')}: </dt>
          <dd className="inline">{formatDateTime(r.receivedAt)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">{t('purchases.invoiceNumber')}: </dt>
          <dd className="inline">
            {r.invoiceNumber ?? '—'} ({formatDate(r.invoiceDate)})
          </dd>
        </div>
        {r.order && (
          <div>
            <Link to={`/compras/encomendas/${r.order.id}`} className="hover:underline">
              {t('purchases.fromOrder', { n: r.order.number })}
            </Link>
          </div>
        )}
        {r.attachmentUrl && (
          <div>
            <button
              className="text-blue-700 hover:underline"
              onClick={() => apiOpen(r.attachmentUrl!).catch((e: Error) => setError(e.message))}
            >
              {t('purchases.viewAttachment')} ({r.attachmentName})
            </button>
          </div>
        )}
      </dl>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('stock.product')}</th>
            <th className={`${thCls} text-right`}>{t('stock.qty')}</th>
            <th className={`${thCls} text-right`}>{t('purchases.unitPrice')}</th>
            <th className={`${thCls} text-right`}>{t('purchases.lineTotal')}</th>
            <th className={thCls}>{t('stock.lot')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {r.lines.map((l) => (
            <tr key={l.id}>
              <td className={tdCls}>{productLabel(l.product)}</td>
              <td className={`${tdCls} text-right`}>
                {formatQty(l.qty)} {l.unit.symbol}
              </td>
              <td className={`${tdCls} text-right`}>{formatMoney(l.unitPrice)}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(l.total)}</td>
              <td className={tdCls}>{l.lotCode && `${l.lotCode} (${formatDate(l.expiryDate)})`}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className={tdCls} colSpan={3}>
              {t('common.total')}
            </td>
            <td className={`${tdCls} text-right`}>{formatMoney(r.totalAmount)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <ErrorBox>{error}</ErrorBox>
      {r.status === 'POSTED' && (
        <ConfirmButton className={secondaryCls} onConfirm={cancel}>
          {t('purchases.cancelReceipt')}
        </ConfirmButton>
      )}
    </div>
  );
}
