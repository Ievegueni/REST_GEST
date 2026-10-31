import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { productLabel } from '../../components/ProductLines';
import {
  buttonCls,
  ErrorBox,
  inputCls,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan, useSession } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { formatCost, formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { ProductRow } from '../types';
import type { SaleItem, SaleItemRow } from './types';

type Line = { text: string; qty: string; unitId: string; lossPct: string };
const empty = (): Line => ({ text: '', qty: '', unitId: '', lossPct: '0' });
const subLabel = (s: { code: string; name: string }) => `[sub] ${s.code} · ${s.name}`;

export function SaleItemPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'novo';
  const { unitId } = useSession();
  const { data, error, reload } = useApi<SaleItem>(
    isNew ? null : `/sale-items/${id}${unitId ? `?unitId=${unitId}` : ''}`,
  );
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!isNew && !data) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <SaleItemForm key={JSON.stringify(data)} item={data} reload={reload} />;
}

function SaleItemForm({ item, reload }: { item: SaleItem | null; reload: () => void }) {
  const navigate = useNavigate();
  const manage = useCan('recipes.manage');
  const { data: products } = useApi<ProductRow[]>('/products?active=true');
  const { data: items } = useApi<SaleItemRow[]>('/sale-items');
  const subs = items?.filter((i) => i.isSubRecipe && i.id !== item?.id) ?? [];

  const [form, setForm] = useState({
    code: item?.code ?? '',
    name: item?.name ?? '',
    salePrice: item?.salePrice?.toString() ?? '',
    isSubRecipe: item?.isSubRecipe ?? false,
    yieldQty: item?.yieldQty ?? '1',
    yieldUnit: item?.yieldUnit ?? '',
    active: item?.active ?? true,
  });
  const [lines, setLines] = useState<Line[]>(() =>
    item?.lines.length
      ? item.lines.map((l) => ({
          text: l.product ? productLabel(l.product) : subLabel(l.subRecipe!),
          qty: l.qty,
          unitId: l.unitId ?? '',
          lossPct: l.lossPct,
        }))
      : [empty()],
  );
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string | boolean) => setForm({ ...form, [k]: v });
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const byLabel = new Map<
    string,
    { productId?: string; subRecipeId?: string; product?: ProductRow }
  >([
    ...(products ?? []).map(
      (p) => [productLabel(p).toLowerCase(), { productId: p.id, product: p }] as const,
    ),
    ...subs.map((s) => [subLabel(s).toLowerCase(), { subRecipeId: s.id }] as const),
  ]);
  // aceita o texto completo da lista ou só o código (produtos têm prioridade sobre sub-receitas)
  const byCode = new Map<
    string,
    { productId?: string; subRecipeId?: string; product?: ProductRow }
  >([
    ...subs.map((sr) => [sr.code.toLowerCase(), { subRecipeId: sr.id }] as const),
    ...(products ?? []).map(
      (p) => [p.code.toLowerCase(), { productId: p.id, product: p }] as const,
    ),
  ]);
  const resolve = (text: string) =>
    byLabel.get(text.trim().toLowerCase()) ?? byCode.get(text.trim().toLowerCase());
  const productName = new Map(products?.map((p) => [p.id, p]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const out = [];
    for (const l of lines.filter((l) => l.text.trim())) {
      const r = resolve(l.text);
      if (!r) return setError(t('recipes.unknownIngredient', { name: l.text }));
      out.push({
        productId: r.productId ?? null,
        subRecipeId: r.subRecipeId ?? null,
        unitId: r.productId ? l.unitId || null : null,
        qty: Number(l.qty),
        lossPct: Number(l.lossPct || 0),
      });
    }
    try {
      const saved = await api<{ id: string }>(item ? `/sale-items/${item.id}` : '/sale-items', {
        method: item ? 'PUT' : 'POST',
        body: {
          ...form,
          salePrice: form.salePrice === '' ? null : Number(form.salePrice),
          yieldQty: form.isSubRecipe ? Number(form.yieldQty) : 1,
          lines: out,
        },
      });
      if (item) reload();
      else navigate(`/fichas/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const cost = item?.breakdown ? Number(item.breakdown.total) : null;
  const price = form.salePrice === '' ? null : Number(form.salePrice);

  return (
    <form onSubmit={submit} className="max-w-5xl space-y-4">
      <Link to="/fichas" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {item ? `${item.code} · ${item.name}` : t('recipes.new')}
      </h2>
      <fieldset disabled={!manage} className="space-y-4">
        <div className="grid gap-3 rounded-xl border bg-white shadow-xs p-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span>{t('recipes.code')} *</span>
            <input
              className={inputCls}
              required
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>{t('recipes.name')} *</span>
            <input
              className={inputCls}
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input
              type="checkbox"
              checked={form.isSubRecipe}
              onChange={(e) => set('isSubRecipe', e.target.checked)}
            />
            {t('recipes.isSubRecipe')}
          </label>
          {form.isSubRecipe ? (
            <>
              <label className="space-y-1 text-sm">
                <span>{t('recipes.yieldQty')} *</span>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={form.yieldQty}
                  onChange={(e) => set('yieldQty', e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('recipes.yieldUnit')}</span>
                <input
                  className={inputCls}
                  value={form.yieldUnit}
                  onChange={(e) => set('yieldUnit', e.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="space-y-1 text-sm">
              <span>{t('recipes.salePrice')}</span>
              <input
                className={inputCls}
                type="number"
                min={0}
                step={1}
                value={form.salePrice}
                onChange={(e) => set('salePrice', e.target.value)}
              />
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            {t('common.active')}
          </label>
        </div>

        <div className="space-y-2 rounded-xl border bg-white shadow-xs p-4">
          <h3 className="font-medium">{t('recipes.ingredients')}</h3>
          <p className="text-xs text-slate-500">{t('recipes.lossHint')}</p>
          <datalist id="ingredients">
            {products?.map((p) => (
              <option key={p.id} value={productLabel(p)} />
            ))}
            {subs.map((s) => (
              <option key={s.id} value={subLabel(s)} />
            ))}
          </datalist>
          {lines.map((l, i) => {
            const r = resolve(l.text);
            const p = r?.product;
            const sub = r?.subRecipeId ? subs.find((s) => s.id === r.subRecipeId) : null;
            const units = p
              ? [
                  { id: '', symbol: p.stockUnit.symbol },
                  ...(p.conversions ?? []).map((c) => ({ id: c.unitId, symbol: c.unit.symbol })),
                ]
              : [];
            return (
              <div key={i} className="flex flex-wrap items-end gap-2 text-sm">
                <label className="min-w-64 flex-1 space-y-1">
                  <span>{t('recipes.ingredient')}</span>
                  <input
                    className={inputCls}
                    list="ingredients"
                    value={l.text}
                    onChange={(e) => setLine(i, { text: e.target.value, unitId: '' })}
                  />
                </label>
                <label className="w-28 space-y-1">
                  <span>{t('stock.qty')}</span>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step="any"
                    required={!!l.text}
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: e.target.value })}
                  />
                </label>
                <label className="w-24 space-y-1">
                  <span>{t('stock.unit')}</span>
                  {sub ? (
                    <input className={inputCls} disabled value={sub.yieldUnit ?? ''} />
                  ) : (
                    <select
                      className={inputCls}
                      value={l.unitId}
                      onChange={(e) => setLine(i, { unitId: e.target.value })}
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.symbol}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className="w-20 space-y-1">
                  <span>{t('recipes.lossPct')}</span>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    max={95}
                    step="any"
                    value={l.lossPct}
                    onChange={(e) => setLine(i, { lossPct: e.target.value })}
                  />
                </label>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="pb-2 text-red-600 hover:underline"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  >
                    {t('common.remove')}
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className={secondaryCls}
            onClick={() => setLines([...lines, empty()])}
          >
            {t('stock.addLine')}
          </button>
        </div>
        <ErrorBox>{error}</ErrorBox>
        {manage && <button className={buttonCls}>{t('common.save')}</button>}
      </fieldset>

      {item?.breakdown && (
        <section className="space-y-2">
          <h3 className="font-medium">{t('recipes.breakdown')}</h3>
          <table className={tableCls}>
            <thead className="bg-slate-100">
              <tr>
                <th className={thCls}>{t('stock.product')}</th>
                <th className={`${thCls} text-right`}>{t('recipes.grossQty')}</th>
                <th className={`${thCls} text-right`}>{t('stock.avgCost')}</th>
                <th className={`${thCls} text-right`}>{t('recipes.cost')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {item.breakdown.parts.map((p) => {
                const prod = productName.get(p.productId);
                return (
                  <tr key={p.productId}>
                    <td className={tdCls}>{prod ? productLabel(prod) : p.productId}</td>
                    <td className={`${tdCls} text-right`}>
                      {formatQty(p.qty)} {prod?.stockUnit.symbol}
                    </td>
                    <td className={`${tdCls} text-right`}>{formatCost(p.unitCost)}</td>
                    <td className={`${tdCls} text-right`}>{formatCost(p.cost)}</td>
                  </tr>
                );
              })}
              <tr className="font-medium">
                <td className={tdCls} colSpan={3}>
                  {t('recipes.cost')}
                  {price != null &&
                    cost != null &&
                    ` · ${t('recipes.margin')}: ${formatMoney(Math.round(price - cost))} (${price ? Math.round(((price - cost) / price) * 1000) / 10 : 0}%)`}
                </td>
                <td className={`${tdCls} text-right`}>{formatCost(cost)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </form>
  );
}
