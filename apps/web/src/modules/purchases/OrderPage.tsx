import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmButton } from '../../components/ConfirmButton';
import {
  emptyLine,
  ProductLines,
  productLabel,
  resolveLines,
  type Line,
} from '../../components/ProductLines';
import {
  buttonCls,
  ErrorBox,
  inputCls,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { ProductRow, Supplier, Unit } from '../types';
import type { Order } from './types';

export function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'nova';
  const { data, error, reload } = useApi<Order>(isNew ? null : `/purchase-orders/${id}`);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!isNew && !data) return <p className="text-slate-500">{t('common.loading')}</p>;
  if (data && data.status !== 'DRAFT') return <OrderView order={data} reload={reload} />;
  return <OrderForm key={JSON.stringify(data)} order={data} reload={reload} />;
}

function OrderForm({ order, reload }: { order: Order | null; reload: () => void }) {
  const navigate = useNavigate();
  const { data: suppliers } = useApi<Supplier[]>('/suppliers');
  const { data: units } = useApi<Unit[]>('/units');
  const { data: products } = useApi<ProductRow[]>('/products?active=true');
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? '');
  const [unitId, setUnitId] = useState(order?.unitId ?? '');
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() =>
    order
      ? order.lines.map((l) =>
          emptyLine({
            text: productLabel(l.product),
            qty: l.qty,
            unitId: l.unitId,
            unitPrice: l.unitPrice?.toString() ?? '',
          }),
        )
      : [emptyLine()],
  );
  const [error, setError] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const r = resolveLines(products, lines);
    if (r.error) return setError(r.error);
    const body = {
      supplierId,
      unitId: unitId || units?.find((u) => u.active)?.id,
      expectedDate: expectedDate || null,
      notes,
      lines: r.items!.map(({ line, product, unitId }) => ({
        productId: product.id,
        unitId,
        qty: Number(line.qty),
        unitPrice: line.unitPrice === '' ? null : Number(line.unitPrice),
      })),
    };
    try {
      const saved = await api<Order>(order ? `/purchase-orders/${order.id}` : '/purchase-orders', {
        method: order ? 'PUT' : 'POST',
        body,
      });
      if (order) reload();
      else navigate(`/compras/encomendas/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const status = async (s: 'SENT' | 'CANCELLED') => {
    try {
      await api(`/purchase-orders/${order!.id}/status`, { body: { status: s } });
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={save} className="max-w-5xl space-y-4">
      <Link to="/compras" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {order ? t('purchases.order', { n: order.number }) : t('purchases.newOrder')}
        {order && <span className="ml-2 text-sm text-slate-500">({t('orderStatus.DRAFT')})</span>}
      </h2>
      <div className="grid gap-3 rounded-xl border bg-white shadow-xs p-4 md:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span>{t('purchases.supplier')} *</span>
          <select
            className={inputCls}
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">—</option>
            {suppliers
              ?.filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('purchases.unit')} *</span>
          <select
            className={inputCls}
            required
            value={unitId || units?.find((u) => u.active)?.id || ''}
            onChange={(e) => setUnitId(e.target.value)}
          >
            {units
              ?.filter((u) => u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('purchases.expectedDate')}</span>
          <input
            className={inputCls}
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('common.notes')}</span>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <ProductLines
        products={products}
        lines={lines}
        onChange={setLines}
        price={{ label: t('purchases.unitPrice') }}
      />
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap gap-2">
        <button className={buttonCls}>{t('common.save')}</button>
        {order && (
          <>
            <button type="button" className={secondaryCls} onClick={() => status('SENT')}>
              {t('purchases.markSent')}
            </button>
            <Link to={`/compras/recepcoes/nova?encomenda=${order.id}`} className={secondaryCls}>
              {t('purchases.receive')}
            </Link>
            <ConfirmButton onConfirm={() => status('CANCELLED')}>
              {t('purchases.cancelOrder')}
            </ConfirmButton>
          </>
        )}
      </div>
    </form>
  );
}

/** Encomenda já enviada: encomendado vs recebido e recepções. */
function OrderView({ order, reload }: { order: Order; reload: () => void }) {
  const [error, setError] = useState('');
  const open = ['SENT', 'PARTIAL'].includes(order.status);
  const cancel = async () => {
    try {
      await api(`/purchase-orders/${order.id}/status`, { body: { status: 'CANCELLED' } });
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="max-w-5xl space-y-4">
      <Link to="/compras" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {t('purchases.order', { n: order.number })}
        <span className="ml-2 text-sm text-slate-500">
          ({t(`orderStatus.${order.status}` as TKey)})
        </span>
      </h2>
      <p className="text-sm text-slate-600">
        {order.supplier.name} · {order.unit.name} · {t('purchases.expectedDate')}:{' '}
        {formatDate(order.expectedDate)}
      </p>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('stock.product')}</th>
            <th className={`${thCls} text-right`}>{t('purchases.ordered')}</th>
            <th className={`${thCls} text-right`}>{t('purchases.received')}</th>
            <th className={`${thCls} text-right`}>{t('purchases.pending')}</th>
            <th className={`${thCls} text-right`}>{t('purchases.unitPrice')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {order.lines.map((l) => {
            const pending = Math.max(0, Number(l.qty) - Number(l.receivedQty));
            return (
              <tr key={l.id}>
                <td className={tdCls}>{productLabel(l.product)}</td>
                <td className={`${tdCls} text-right`}>
                  {formatQty(l.qty)} {l.unit.symbol}
                </td>
                <td className={`${tdCls} text-right`}>{formatQty(l.receivedQty)}</td>
                <td className={`${tdCls} text-right ${pending > 0 ? 'text-amber-700' : ''}`}>
                  {formatQty(pending)}
                </td>
                <td className={`${tdCls} text-right`}>{formatMoney(l.unitPrice)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {order.receipts.length > 0 && (
        <ul className="divide-y rounded-xl border bg-white shadow-xs text-sm">
          {order.receipts.map((r) => (
            <li key={r.id} className="flex justify-between px-4 py-2">
              <Link to={`/compras/recepcoes/${r.id}`} className="hover:underline">
                {t('purchases.receipt', { n: r.number })} · {formatDate(r.receivedAt)}
              </Link>
              <span>
                {formatMoney(r.totalAmount)} · {t(`docStatus.${r.status}` as TKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="flex gap-2">
          <Link to={`/compras/recepcoes/nova?encomenda=${order.id}`} className={buttonCls}>
            {t('purchases.receive')}
          </Link>
          <ConfirmButton onConfirm={cancel}>{t('purchases.cancelOrder')}</ConfirmButton>
        </div>
      )}
    </div>
  );
}
