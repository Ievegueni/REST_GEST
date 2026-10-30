import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmButton } from '../../components/ConfirmButton';
import { productLabel, productResolver } from '../../components/ProductLines';
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
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDateTime, formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { ProductRow } from '../types';

type Count = {
  id: string;
  number: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  blocksMovements: boolean;
  openedAt: string;
  closedAt: string | null;
  location: { name: string; unit: { name: string } };
  category: { name: string } | null;
  lines: {
    id: string;
    productId: string;
    countedQty: string | null;
    expectedQty: string | null;
    unitCost: string | null;
    product: {
      id: string;
      code: string;
      name: string;
      stockUnit: { symbol: string };
      category: { name: string };
    };
  }[];
};

export function InventoryPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload, setData } = useApi<Count>(`/inventory-counts/${id}`);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <CountView key={data.status} count={data} reload={reload} setCount={setData} />;
}

function CountView({
  count,
  reload,
  setCount,
}: {
  count: Count;
  reload: () => void;
  setCount: (c: Count) => void;
}) {
  const canClose = useCan('inventory.close');
  const open = count.status === 'OPEN';
  const { data: products } = useApi<ProductRow[]>(open ? '/products?active=true' : null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [add, setAdd] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const value = (l: Count['lines'][number]) => edits[l.productId] ?? l.countedQty ?? '';
  const diffOf = (l: Count['lines'][number]) => {
    const v = value(l);
    return v === '' || l.expectedQty == null ? null : Number(v) - Number(l.expectedQty);
  };
  const totalDiff = count.lines.reduce((s, l) => s + (diffOf(l) ?? 0) * Number(l.unitCost ?? 0), 0);
  const done = count.lines.filter((l) => value(l) !== '').length;
  const q = search.trim().toLowerCase();
  const shown = count.lines.filter((l) => !q || productLabel(l.product).toLowerCase().includes(q));

  const save = async (extra: { productId: string; countedQty: number | null }[] = []) => {
    setError('');
    setMsg('');
    const lines = [
      ...Object.entries(edits).map(([productId, v]) => ({
        productId,
        countedQty: v === '' ? null : Number(v),
      })),
      ...extra,
    ];
    if (!lines.length) return true;
    try {
      setCount(
        await api<Count>(`/inventory-counts/${count.id}/lines`, { method: 'PUT', body: { lines } }),
      );
      setEdits({});
      setMsg(t('inventory.saved'));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  const addProduct = async () => {
    const p = productResolver(products)(add);
    if (!p) return setError(t('stock.unknownProduct', { name: add }));
    if (await save([{ productId: p.id, countedQty: null }])) setAdd('');
  };

  const act = async (action: 'close' | 'cancel') => {
    if (action === 'close' && !(await save())) return;
    try {
      await api(`/inventory-counts/${count.id}/${action}`, { method: 'POST' });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-5xl space-y-4">
      <Link to="/stock/inventarios" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {t('inventory.count', { n: count.number })}
        <span className="ml-2 text-sm text-slate-500">
          ({t(`inventoryStatus.${count.status}` as TKey)})
        </span>
      </h2>
      <p className="text-sm text-slate-600">
        {count.location.unit.name} · {count.location.name}
        {count.category && ` · ${count.category.name}`} ·{' '}
        {formatDateTime(count.closedAt ?? count.openedAt)}
        {open && count.blocksMovements && (
          <span className="ml-2 text-amber-700">· {t('inventory.blocking')}</span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>{t('inventory.progress', { done, total: count.lines.length })}</span>
        <span className="ml-auto font-medium">
          {t('inventory.totalDiff', { value: formatMoney(Math.round(totalDiff)) })}
        </span>
      </div>

      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('stock.product')}</th>
            <th className={`${thCls} text-right`}>{t('inventory.expected')}</th>
            <th className={`${thCls} text-right`}>{t('inventory.counted')}</th>
            <th className={`${thCls} text-right`}>{t('inventory.difference')}</th>
            <th className={`${thCls} text-right`}>{t('inventory.valueDiff')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {shown.map((l) => {
            const diff = diffOf(l);
            return (
              <tr key={l.id}>
                <td className={tdCls}>
                  {productLabel(l.product)}
                  <div className="text-xs text-slate-500">{l.product.category.name}</div>
                </td>
                <td className={`${tdCls} text-right`}>{formatQty(l.expectedQty)}</td>
                <td className={`${tdCls} text-right`}>
                  {open ? (
                    <input
                      aria-label={`${t('inventory.counted')} ${l.product.name}`}
                      className={`${inputBase} w-28 text-right text-base`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={value(l)}
                      onChange={(e) => setEdits({ ...edits, [l.productId]: e.target.value })}
                    />
                  ) : l.countedQty == null ? (
                    <span className="text-slate-400">{t('inventory.notCounted')}</span>
                  ) : (
                    formatQty(l.countedQty)
                  )}{' '}
                  <span className="text-xs text-slate-500">{l.product.stockUnit.symbol}</span>
                </td>
                <td
                  className={`${tdCls} text-right ${diff ? (diff < 0 ? 'text-red-700' : 'text-emerald-700') : ''}`}
                >
                  {diff == null ? '—' : formatQty(diff)}
                </td>
                <td className={`${tdCls} text-right`}>
                  {diff == null ? '—' : formatMoney(Math.round(diff * Number(l.unitCost ?? 0)))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      {open && (
        <>
          <div className="flex flex-wrap gap-2">
            <datalist id="inv-products">
              {products?.map((p) => (
                <option key={p.id} value={productLabel(p)} />
              ))}
            </datalist>
            <input
              className={`${inputCls} max-w-sm`}
              list="inv-products"
              placeholder={t('inventory.addProduct')}
              value={add}
              onChange={(e) => setAdd(e.target.value)}
            />
            <button type="button" className={secondaryCls} disabled={!add} onClick={addProduct}>
              {t('common.add')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={buttonCls} onClick={() => save()}>
              {t('inventory.saveCounts')}
            </button>
            {canClose && (
              <>
                <ConfirmButton className={secondaryCls} onConfirm={() => act('close')}>
                  {t('inventory.close')}
                </ConfirmButton>
                <ConfirmButton onConfirm={() => act('cancel')}>
                  {t('inventory.cancel')}
                </ConfirmButton>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
