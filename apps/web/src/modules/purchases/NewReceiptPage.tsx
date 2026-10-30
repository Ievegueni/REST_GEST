import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  emptyLine,
  ProductLines,
  productLabel,
  resolveLines,
  type Line,
} from '../../components/ProductLines';
import { buttonCls, ErrorBox, inputCls } from '../../components/ui';
import { t } from '../../i18n';
import { api, apiUpload } from '../../lib/api';
import { formatMoney, nowLocal } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { ProductRow, Supplier, Unit } from '../types';
import type { Order, Receipt } from './types';

export function NewReceiptPage() {
  const [params] = useSearchParams();
  const orderId = params.get('encomenda');
  const { data: order, error } = useApi<Order>(orderId ? `/purchase-orders/${orderId}` : null);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (orderId && !order) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <ReceiptForm order={order} />;
}

function ReceiptForm({ order }: { order: Order | null }) {
  const navigate = useNavigate();
  const { data: suppliers } = useApi<Supplier[]>('/suppliers');
  const { data: units } = useApi<Unit[]>('/units');
  const { data: products } = useApi<ProductRow[]>('/products?active=true');
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? '');
  const [locationId, setLocationId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [receivedAt, setReceivedAt] = useState(nowLocal);
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lines, setLines] = useState<Line[]>(() =>
    order
      ? order.lines
          .filter((l) => Number(l.qty) > Number(l.receivedQty))
          .map((l) =>
            emptyLine({
              text: productLabel(l.product),
              qty: String(Number(l.qty) - Number(l.receivedQty)),
              unitId: l.unitId,
              unitPrice: l.unitPrice?.toString() ?? '',
              refId: l.id,
            }),
          )
      : [emptyLine()],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const locations =
    units
      ?.filter((u) => u.active && (!order || u.id === order.unitId))
      .flatMap((u) =>
        u.locations.filter((l) => l.active).map((l) => ({ ...l, label: `${u.name} · ${l.name}` })),
      ) ?? [];
  const loc = locations.some((l) => l.id === locationId) ? locationId : (locations[0]?.id ?? '');
  const total = lines.reduce(
    (s, l) => s + Math.round(Number(l.qty || 0) * Number(l.unitPrice || 0)),
    0,
  );

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setAttachment(await apiUpload<{ url: string; name: string }>('/uploads', file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const r = resolveLines(products, lines);
    if (r.error) return setError(r.error);
    setBusy(true);
    try {
      const saved = await api<Receipt>('/goods-receipts', {
        body: {
          supplierId,
          locationId: loc,
          orderId: order?.id ?? null,
          invoiceNumber,
          invoiceDate: invoiceDate || null,
          receivedAt: new Date(receivedAt).toISOString(),
          attachmentUrl: attachment?.url ?? null,
          attachmentName: attachment?.name ?? null,
          lines: r.items!.map(({ line, product, unitId }) => ({
            productId: product.id,
            orderLineId: line.refId ?? null,
            unitId,
            qty: Number(line.qty),
            unitPrice: Number(line.unitPrice),
            lotCode: line.lotCode || null,
            expiryDate: line.expiryDate || null,
          })),
        },
      });
      navigate(`/compras/recepcoes/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-5xl space-y-4">
      <Link to="/compras/recepcoes" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {t('purchases.newReceipt')}
        {order && (
          <span className="ml-2 text-sm text-slate-500">
            {t('purchases.fromOrder', { n: order.number })}
          </span>
        )}
      </h2>
      <div className="grid gap-3 rounded border bg-white p-4 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span>{t('purchases.supplier')} *</span>
          <select
            className={inputCls}
            required
            disabled={!!order}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">—</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('purchases.location')} *</span>
          <select
            className={inputCls}
            required
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
        <label className="space-y-1 text-sm">
          <span>{t('purchases.receivedAt')}</span>
          <input
            className={inputCls}
            type="datetime-local"
            max={nowLocal()}
            required
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('purchases.invoiceNumber')}</span>
          <input
            className={inputCls}
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('purchases.invoiceDate')}</span>
          <input
            className={inputCls}
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('purchases.attachment')}</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="text-sm"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          {uploading && <span className="text-slate-500">{t('purchases.uploading')}</span>}
          {attachment && <span className="text-emerald-700">✔ {attachment.name}</span>}
        </label>
      </div>
      <ProductLines
        products={products}
        lines={lines}
        onChange={setLines}
        price={{ label: t('purchases.unitPrice'), required: true }}
        lots
        lockLinked
      />
      <p className="text-right text-sm font-medium">
        {t('common.total')}: {formatMoney(total)}
      </p>
      <ErrorBox>{error}</ErrorBox>
      <button className={buttonCls} disabled={busy || uploading || !loc}>
        {t('purchases.post')}
      </button>
    </form>
  );
}
