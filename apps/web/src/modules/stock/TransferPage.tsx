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
  inputBase,
  inputCls,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatCost, formatDateTime, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { ProductRow, Unit } from '../types';

type Loc = { id: string; name: string; unitId: string; unit: { name: string } };
type Transfer = {
  id: string;
  number: number;
  status: 'PENDING' | 'SENT' | 'RECEIVED' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  fromLocation: Loc;
  toLocation: Loc;
  lines: {
    id: string;
    qty: string;
    sentQty: string | null;
    receivedQty: string | null;
    unitCost: string | null;
    product: { id: string; code: string; name: string; stockUnit: { symbol: string } };
  }[];
};

export function TransferPage() {
  const { id } = useParams<{ id: string }>();
  return id === 'nova' ? <NewTransfer /> : <TransferView id={id!} />;
}

function NewTransfer() {
  const navigate = useNavigate();
  const { data: units } = useApi<Unit[]>('/units');
  const { data: products } = useApi<ProductRow[]>('/products?active=true');
  const locations =
    units
      ?.filter((u) => u.active)
      .flatMap((u) =>
        u.locations.filter((l) => l.active).map((l) => ({ ...l, label: `${u.name} · ${l.name}` })),
      ) ?? [];
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const r = resolveLines(products, lines);
    if (r.error) return setError(r.error);
    try {
      const saved = await api<Transfer>('/transfers', {
        body: {
          fromLocationId: from,
          toLocationId: to,
          notes,
          lines: r.items!.map(({ line, product, unitId }) => ({
            productId: product.id,
            qty: Number(line.qty),
            unitId,
          })),
        },
      });
      navigate(`/stock/transferencias/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="space-y-1 text-sm">
      <span>{label} *</span>
      <select
        className={inputCls}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit} className="max-w-5xl space-y-4">
      <Link to="/stock/transferencias" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">{t('transfers.new')}</h2>
      <div className="grid gap-3 rounded-xl border bg-white shadow-xs p-4 md:grid-cols-3">
        {select(from, setFrom, t('transfers.from'))}
        {select(to, setTo, t('transfers.to'))}
        <label className="space-y-1 text-sm">
          <span>{t('common.notes')}</span>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <ProductLines products={products} lines={lines} onChange={setLines} />
      <ErrorBox>{error}</ErrorBox>
      <button className={buttonCls}>{t('transfers.create')}</button>
    </form>
  );
}

function TransferView({ id }: { id: string }) {
  const { data: tr, error: loadError, reload } = useApi<Transfer>(`/transfers/${id}`);
  if (loadError) return <ErrorBox>{loadError}</ErrorBox>;
  if (!tr) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <TransferDetail key={JSON.stringify(tr)} tr={tr} reload={reload} />;
}

function TransferDetail({ tr, reload }: { tr: Transfer; reload: () => void }) {
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(tr.lines.map((l) => [l.id, l.sentQty ?? l.qty])),
  );
  const [error, setError] = useState('');

  const act = async (action: 'send' | 'receive' | 'cancel') => {
    setError('');
    try {
      await api(`/transfers/${tr.id}/${action}`, {
        method: 'POST',
        body:
          action === 'receive'
            ? {
                lines: tr.lines.map((l) => ({ lineId: l.id, receivedQty: Number(received[l.id]) })),
              }
            : undefined,
      });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-5xl space-y-4">
      <Link to="/stock/transferencias" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {t('transfers.transfer', { n: tr.number })}
        <span className="ml-2 text-sm text-slate-500">
          ({t(`transferStatus.${tr.status}` as TKey)})
        </span>
      </h2>
      <p className="text-sm text-slate-600">
        {tr.fromLocation.unit.name} · {tr.fromLocation.name} → {tr.toLocation.unit.name} ·{' '}
        {tr.toLocation.name}
        {tr.sentAt && ` · ${t('transfers.sent')}: ${formatDateTime(tr.sentAt)}`}
        {tr.receivedAt && ` · ${t('transfers.received')}: ${formatDateTime(tr.receivedAt)}`}
      </p>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('stock.product')}</th>
            <th className={`${thCls} text-right`}>{t('transfers.qty')}</th>
            <th className={`${thCls} text-right`}>{t('transfers.sent')}</th>
            <th className={`${thCls} text-right`}>{t('stock.unitCost')}</th>
            <th className={`${thCls} text-right`}>{t('transfers.received')}</th>
            <th className={`${thCls} text-right`}>{t('transfers.difference')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tr.lines.map((l) => {
            const diff =
              l.sentQty != null && l.receivedQty != null
                ? Number(l.sentQty) - Number(l.receivedQty)
                : null;
            return (
              <tr key={l.id}>
                <td className={tdCls}>{productLabel(l.product)}</td>
                <td className={`${tdCls} text-right`}>
                  {formatQty(l.qty)} {l.product.stockUnit.symbol}
                </td>
                <td className={`${tdCls} text-right`}>{formatQty(l.sentQty)}</td>
                <td className={`${tdCls} text-right`}>{formatCost(l.unitCost)}</td>
                <td className={`${tdCls} text-right`}>
                  {tr.status === 'SENT' ? (
                    <input
                      aria-label={`${t('transfers.received')} ${l.product.name}`}
                      className={`${inputBase} w-28 text-right`}
                      type="number"
                      min={0}
                      max={Number(l.sentQty)}
                      step="any"
                      value={received[l.id]}
                      onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })}
                    />
                  ) : (
                    formatQty(l.receivedQty)
                  )}
                </td>
                <td className={`${tdCls} text-right ${diff ? 'text-red-700' : ''}`}>
                  {diff == null ? '—' : formatQty(diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap gap-2">
        {tr.status === 'PENDING' && (
          <button className={buttonCls} onClick={() => act('send')}>
            {t('transfers.send')}
          </button>
        )}
        {tr.status === 'SENT' && (
          <button className={buttonCls} onClick={() => act('receive')}>
            {t('transfers.receive')}
          </button>
        )}
        {(tr.status === 'PENDING' || tr.status === 'SENT') && (
          <ConfirmButton className={secondaryCls} onConfirm={() => act('cancel')}>
            {t('transfers.cancel')}
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
