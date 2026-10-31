import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  buttonCls,
  ErrorBox,
  inputCls,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { useCan } from '../../features/session';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import {
  categoryTree,
  type Category,
  type MeasureUnit,
  type Product,
  type Supplier,
  type Unit,
} from '../types';

type Form = {
  code: string;
  name: string;
  categoryId: string;
  stockUnitId: string;
  purchaseUnitId: string;
  consumptionUnitId: string;
  tracksLots: boolean;
  reorderPoint: string;
  preferredSupplierId: string;
  active: boolean;
  conversions: { unitId: string; factor: string }[];
  limits: Record<string, { minQty: string; maxQty: string }>;
};

const empty: Form = {
  code: '',
  name: '',
  categoryId: '',
  stockUnitId: '',
  purchaseUnitId: '',
  consumptionUnitId: '',
  tracksLots: false,
  reorderPoint: '',
  preferredSupplierId: '',
  active: true,
  conversions: [],
  limits: {},
};

const toForm = (p: Product): Form => ({
  code: p.code,
  name: p.name,
  categoryId: p.categoryId,
  stockUnitId: p.stockUnitId,
  purchaseUnitId: p.purchaseUnitId ?? '',
  consumptionUnitId: p.consumptionUnitId ?? '',
  tracksLots: p.tracksLots,
  reorderPoint: p.reorderPoint ?? '',
  preferredSupplierId: p.preferredSupplierId ?? '',
  active: p.active,
  conversions: p.conversions.map((c) => ({ unitId: c.unitId, factor: c.factor })),
  limits: Object.fromEntries(
    p.locationLimits.map((l) => [l.locationId, { minQty: l.minQty ?? '', maxQty: l.maxQty ?? '' }]),
  ),
});

const num = (s: string) => (s === '' ? null : Number(s));

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'novo';
  const { data: product, error } = useApi<Product>(isNew ? null : `/products/${id}`);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!isNew && !product) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <ProductForm key={id} product={isNew ? null : product} />;
}

function ProductForm({ product }: { product: Product | null }) {
  const isNew = !product;
  const navigate = useNavigate();
  const manage = useCan('catalog.manage');
  const { data: cats } = useApi<Category[]>('/categories');
  const { data: mus } = useApi<MeasureUnit[]>('/measure-units');
  const { data: units } = useApi<Unit[]>('/units');
  const { data: suppliers } = useApi<Supplier[]>('/suppliers');
  const [form, setForm] = useState<Form>(() => (product ? toForm(product) : empty));
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const symbol = new Map(mus?.map((m) => [m.id, m.symbol]));
  const stockSymbol = symbol.get(form.stockUnitId) ?? '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    const body = {
      ...form,
      purchaseUnitId: form.purchaseUnitId || null,
      consumptionUnitId: form.consumptionUnitId || null,
      preferredSupplierId: form.preferredSupplierId || null,
      reorderPoint: num(form.reorderPoint),
      conversions: form.conversions
        .filter((c) => c.unitId)
        .map((c) => ({ unitId: c.unitId, factor: Number(c.factor) })),
      limits: Object.entries(form.limits).map(([locationId, l]) => ({
        locationId,
        minQty: num(l.minQty),
        maxQty: num(l.maxQty),
      })),
    };
    try {
      const saved = await api<Product>(isNew ? '/products' : `/products/${product.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body,
      });
      if (isNew) navigate(`/catalogo/produtos/${saved.id}`, { replace: true });
      else setMsg(t('common.saved'));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const muOptions = mus?.map((m) => (
    <option key={m.id} value={m.id}>
      {m.name} ({m.symbol})
    </option>
  ));

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-6">
      <Link to="/catalogo/produtos" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {isNew ? t('product.new') : `${product!.code} · ${product!.name}`}
      </h2>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      <fieldset disabled={!manage} className="space-y-6">
        <section className="grid gap-3 rounded-xl border bg-white shadow-xs p-4 md:grid-cols-2">
          <Labeled label={`${t('product.code')} *`}>
            <input
              className={inputCls}
              required
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
            />
          </Labeled>
          <Labeled label={`${t('product.name')} *`}>
            <input
              className={inputCls}
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Labeled>
          <Labeled label={`${t('product.category')} *`}>
            <select
              className={inputCls}
              required
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">—</option>
              {categoryTree(cats ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.path}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={`${t('product.stockUnit')} *`}>
            <select
              className={inputCls}
              required
              value={form.stockUnitId}
              onChange={(e) => set('stockUnitId', e.target.value)}
            >
              <option value="">—</option>
              {muOptions}
            </select>
          </Labeled>
          <Labeled label={t('product.purchaseUnit')}>
            <select
              className={inputCls}
              value={form.purchaseUnitId}
              onChange={(e) => set('purchaseUnitId', e.target.value)}
            >
              <option value="">—</option>
              {muOptions}
            </select>
          </Labeled>
          <Labeled label={t('product.consumptionUnit')}>
            <select
              className={inputCls}
              value={form.consumptionUnitId}
              onChange={(e) => set('consumptionUnitId', e.target.value)}
            >
              <option value="">—</option>
              {muOptions}
            </select>
          </Labeled>
          <Labeled label={`${t('product.reorderPoint')} (${stockSymbol})`}>
            <input
              className={inputCls}
              type="number"
              min={0}
              step="any"
              value={form.reorderPoint}
              onChange={(e) => set('reorderPoint', e.target.value)}
            />
          </Labeled>
          <Labeled label={t('product.preferredSupplier')}>
            <select
              className={inputCls}
              value={form.preferredSupplierId}
              onChange={(e) => set('preferredSupplierId', e.target.value)}
            >
              <option value="">—</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Labeled>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.tracksLots}
              onChange={(e) => set('tracksLots', e.target.checked)}
            />
            {t('product.tracksLots')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            {t('common.active')}
          </label>
        </section>

        <section className="space-y-2 rounded-xl border bg-white shadow-xs p-4">
          <h3 className="font-medium">{t('product.conversions')}</h3>
          <p className="text-xs text-slate-500">{t('product.conversionHint')}</p>
          {form.conversions.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span>1</span>
              <select
                aria-label={t('measureUnit.symbol')}
                className={`${inputCls} max-w-48`}
                value={c.unitId}
                onChange={(e) =>
                  set(
                    'conversions',
                    form.conversions.map((x, j) =>
                      j === i ? { ...x, unitId: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="">—</option>
                {muOptions}
              </select>
              <span>=</span>
              <input
                aria-label={t('product.factor')}
                className={`${inputCls} max-w-32`}
                type="number"
                min={0}
                step="any"
                required
                value={c.factor}
                onChange={(e) =>
                  set(
                    'conversions',
                    form.conversions.map((x, j) =>
                      j === i ? { ...x, factor: e.target.value } : x,
                    ),
                  )
                }
              />
              <span>{stockSymbol}</span>
              <button
                type="button"
                className="text-red-600 hover:underline"
                onClick={() =>
                  set(
                    'conversions',
                    form.conversions.filter((_, j) => j !== i),
                  )
                }
              >
                {t('common.remove')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className={secondaryCls}
            onClick={() => set('conversions', [...form.conversions, { unitId: '', factor: '' }])}
          >
            {t('common.add')}
          </button>
        </section>

        <section className="rounded-xl border bg-white shadow-xs">
          <h3 className="border-b px-4 py-2 font-medium">
            {t('product.limits')} ({stockSymbol})
          </h3>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={thCls}>{t('product.location')}</th>
                <th className={thCls}>{t('product.min')}</th>
                <th className={thCls}>{t('product.max')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {units?.flatMap((u) =>
                u.locations
                  .filter((l) => l.active)
                  .map((l) => {
                    const v = form.limits[l.id] ?? { minQty: '', maxQty: '' };
                    const setL = (k: 'minQty' | 'maxQty', val: string) =>
                      set('limits', { ...form.limits, [l.id]: { ...v, [k]: val } });
                    return (
                      <tr key={l.id}>
                        <td className={tdCls}>
                          {u.name} · {l.name}
                        </td>
                        <td className={tdCls}>
                          <input
                            aria-label={`${t('product.min')} ${l.name}`}
                            className={inputCls}
                            type="number"
                            min={0}
                            step="any"
                            value={v.minQty}
                            onChange={(e) => setL('minQty', e.target.value)}
                          />
                        </td>
                        <td className={tdCls}>
                          <input
                            aria-label={`${t('product.max')} ${l.name}`}
                            className={inputCls}
                            type="number"
                            min={0}
                            step="any"
                            value={v.maxQty}
                            onChange={(e) => setL('maxQty', e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  }),
              )}
            </tbody>
          </table>
        </section>

        {manage && <button className={buttonCls}>{t('common.save')}</button>}
      </fieldset>

      {product && product.supplierProducts.length > 0 && (
        <section>
          <h3 className="mb-2 font-medium">{t('product.suppliers')}</h3>
          <table className={tableCls}>
            <tbody className="divide-y">
              {product.supplierProducts.map((sp) => (
                <tr key={sp.supplier.id}>
                  <td className={tdCls}>
                    <Link to={`/fornecedores/${sp.supplier.id}`} className="hover:underline">
                      {sp.supplier.name}
                    </Link>
                  </td>
                  <td className={`${tdCls} text-right`}>{formatMoney(sp.lastPrice)}</td>
                  <td className={`${tdCls} text-right text-slate-500`}>
                    {sp.lastPriceAt ? new Date(sp.lastPriceAt).toLocaleDateString('pt-AO') : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </form>
  );
}
