/**
 * "Livro" de fichas técnicas em memória: explode artigos de venda em produtos (unidade de stock),
 * com sub-receitas, conversões e % de perda. Usado pelo custo teórico e pela importação de vendas.
 */
import { Prisma } from '@prisma/client';
import type { TenantDb } from '../../core/prisma';
import { AppError } from '../../core/errors';
import type { Tx } from '../stock/engine';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export async function loadRecipeBook(db: TenantDb | Tx) {
  const [items, products] = await Promise.all([
    db.saleItem.findMany({ include: { lines: true } }),
    db.product.findMany({ include: { conversions: true } }),
  ]);
  return {
    items: new Map(items.map((i) => [i.id, i])),
    products: new Map(products.map((p) => [p.id, p])),
  };
}
export type RecipeBook = Awaited<ReturnType<typeof loadRecipeBook>>;

/** Fator para a unidade de stock: 1 [unitId] = factor × unidade de stock. */
function stockFactor(book: RecipeBook, productId: string, unitId: string | null): Decimal {
  const p = book.products.get(productId);
  if (!p) throw new AppError('VALIDATION_ERROR', 'Produto inválido na ficha técnica');
  const u = unitId ?? p.consumptionUnitId ?? p.stockUnitId;
  if (u === p.stockUnitId) return new D(1);
  const c = p.conversions.find((c) => c.unitId === u);
  if (!c) throw new AppError('VALIDATION_ERROR', `Sem conversão de unidade para ${p.name}`);
  return c.factor;
}

/** Quantidades brutas de cada produto (unidade de stock) para `qty` unidades do artigo. */
export function explode(
  book: RecipeBook,
  saleItemId: string,
  qty: Decimal | number,
  out = new Map<string, Decimal>(),
  path: string[] = [],
) {
  const item = book.items.get(saleItemId);
  if (!item) throw new AppError('VALIDATION_ERROR', 'Artigo de venda inválido');
  if (path.includes(saleItemId)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Ficha técnica circular: ${[...path, saleItemId].map((id) => book.items.get(id)?.name).join(' → ')}`,
    );
  }
  const portions = new D(qty).div(item.yieldQty);
  for (const l of item.lines) {
    const gross = l.qty.div(new D(1).sub(l.lossPct.div(100))).mul(portions);
    if (l.subRecipeId) {
      explode(book, l.subRecipeId, gross, out, [...path, saleItemId]);
    } else {
      const q = gross.mul(stockFactor(book, l.productId!, l.unitId));
      out.set(l.productId!, (out.get(l.productId!) ?? new D(0)).add(q));
    }
  }
  return out;
}

/** Custo teórico de 1 unidade do artigo, com o custo médio por produto. */
export function theoreticalCost(
  book: RecipeBook,
  saleItemId: string,
  avgCost: Map<string, Decimal>,
) {
  const parts = [...explode(book, saleItemId, 1)].map(([productId, qty]) => {
    const unitCost = avgCost.get(productId) ?? new D(0);
    return { productId, qty, unitCost, cost: qty.mul(unitCost) };
  });
  return { parts, total: parts.reduce((s, p) => s.add(p.cost), new D(0)) };
}

/** Custo médio por produto: de uma unidade, ou ponderado por todas. */
export async function averageCosts(db: TenantDb | Tx, unitId?: string) {
  const rows = await db.stockCost.findMany({ where: unitId ? { unitId } : {} });
  const acc = new Map<string, { qty: Decimal; value: Decimal; last: Decimal }>();
  for (const r of rows) {
    const a = acc.get(r.productId) ?? { qty: new D(0), value: new D(0), last: r.avgCost };
    if (r.qty.gt(0)) {
      a.qty = a.qty.add(r.qty);
      a.value = a.value.add(r.qty.mul(r.avgCost));
    }
    a.last = r.avgCost;
    acc.set(r.productId, a);
  }
  return new Map([...acc].map(([id, a]) => [id, a.qty.gt(0) ? a.value.div(a.qty) : a.last]));
}

/** Local de saída de um produto numa unidade: categoria do produto ou a mais próxima acima. */
export async function outputLocationResolver(db: TenantDb | Tx, unitId: string) {
  const [cats, maps] = await Promise.all([
    db.category.findMany({ select: { id: true, parentId: true, name: true } }),
    db.categoryOutputLocation.findMany({ where: { unitId } }),
  ]);
  const parent = new Map(cats.map((c) => [c.id, c.parentId]));
  const byCat = new Map(maps.map((m) => [m.categoryId, m.locationId]));
  const names = new Map(cats.map((c) => [c.id, c.name]));
  return {
    resolve(categoryId: string): string | null {
      for (let c: string | null | undefined = categoryId; c; c = parent.get(c)) {
        const loc = byCat.get(c);
        if (loc) return loc;
      }
      return null;
    },
    categoryName: (id: string) => names.get(id) ?? id,
  };
}
