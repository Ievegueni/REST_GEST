/**
 * Relatórios do plano STOCK. Cada relatório devolve colunas tipadas + linhas, usadas pelo ecrã,
 * pelo Excel e pelo PDF. Valores ao custo médio (AOA); quantidades na unidade de stock.
 */
import { Prisma, type MovementType } from '@prisma/client';
import type { Feature } from '@restgest/shared';
import type { AuthContext } from '../../core/auth';
import { dailyCells, metrics, sumCells, type Cell } from '../financial/service';
import { averageCosts, loadRecipeBook, theoreticalCost } from '../recipes/book';
import {
  period,
  round,
  scopeUnits,
  scopeWhere,
  type Column,
  type Filters,
  type Report,
  type Row,
} from './common';

const D = Prisma.Decimal;
const CONSUMPTION: MovementType[] = ['SALE_OUT', 'CONSUMPTION'];
const OUTFLOWS: MovementType[] = [
  'SALE_OUT',
  'CONSUMPTION',
  'WASTE',
  'TRANSFER_OUT',
  'ADJUSTMENT_OUT',
  'RETURN_SUPPLIER',
];

const col = (key: string, label: string, type: Column['type'] = 'text'): Column => ({
  key,
  label,
  type,
});
const sum = (rows: Row[], key: string) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);

async function productInfo(auth: AuthContext, ids: string[]) {
  const ps = await auth.db.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      code: true,
      name: true,
      category: { select: { name: true } },
      stockUnit: { select: { symbol: true } },
    },
  });
  return new Map(ps.map((p) => [p.id, p]));
}

/** Consumo (vendas + consumos internos, líquido de estornos) por produto no período. */
async function consumptionByProduct(auth: AuthContext, f: Filters) {
  const p = period(f);
  const groups = await auth.db.stockMovement.groupBy({
    by: ['productId'],
    where: {
      type: { in: CONSUMPTION },
      occurredAt: { gte: p.gte, lt: p.lt },
      ...(await scopeWhere(auth, f)),
    },
    _sum: { qty: true, totalCost: true },
  });
  return groups
    .map((g) => ({
      productId: g.productId,
      qty: -(g._sum.qty?.toNumber() ?? 0),
      value: -(g._sum.totalCost ?? 0),
    }))
    .filter((g) => g.qty !== 0 || g.value !== 0);
}

// ---------- 1. Stock actual ----------
async function stock(auth: AuthContext, f: Filters): Promise<Report> {
  const where = await scopeWhere(auth, f);
  const balances = await auth.db.stockBalance.findMany({
    where: { qty: { not: 0 }, ...where, product: { ...where.product, active: true } },
    include: {
      location: { select: { name: true, unitId: true, unit: { select: { name: true } } } },
    },
  });
  const costs = await auth.db.stockCost.findMany({
    where: { productId: { in: [...new Set(balances.map((b) => b.productId))] } },
  });
  const avg = new Map(costs.map((c) => [`${c.productId}|${c.unitId}`, c.avgCost.toNumber()]));
  const info = await productInfo(
    auth,
    balances.map((b) => b.productId),
  );
  const byProduct = f.group === 'product';

  const acc = new Map<string, Row>();
  for (const b of balances) {
    const p = info.get(b.productId)!;
    const cost = avg.get(`${b.productId}|${b.location.unitId}`) ?? 0;
    const qty = b.qty.toNumber();
    const key = byProduct ? b.productId : `${b.productId}|${b.locationId}`;
    const r = acc.get(key) ?? {
      code: p.code,
      product: p.name,
      category: p.category.name,
      location: byProduct ? null : `${b.location.unit.name} · ${b.location.name}`,
      unit: p.stockUnit.symbol,
      qty: 0,
      value: 0,
    };
    r.qty = Number(r.qty) + qty;
    r.value = Number(r.value) + qty * cost;
    acc.set(key, r);
  }
  const rows = [...acc.values()]
    .map((r): Row => ({
      ...r,
      value: round(Number(r.value)),
      avgCost: Number(r.qty) ? round(Number(r.value) / Number(r.qty), 2) : 0,
    }))
    .sort((a, b) => String(a.product).localeCompare(String(b.product)));
  return {
    title: 'Stock actual',
    columns: [
      col('code', 'Código'),
      col('product', 'Produto'),
      col('category', 'Categoria'),
      ...(byProduct ? [] : [col('location', 'Local')]),
      col('qty', 'Quantidade', 'qty'),
      col('unit', 'Un.'),
      col('avgCost', 'Custo médio', 'cost'),
      col('value', 'Valor', 'money'),
    ],
    rows,
    totals: { product: 'Total', value: sum(rows, 'value') },
  };
}

// ---------- 2. Consumo ----------
async function consumption(auth: AuthContext, f: Filters): Promise<Report> {
  const data = await consumptionByProduct(auth, f);
  const info = await productInfo(
    auth,
    data.map((d) => d.productId),
  );
  let rows: Row[];
  let columns: Column[];
  if (f.group === 'category') {
    const acc = new Map<string, number>();
    for (const d of data) {
      const c = info.get(d.productId)!.category.name;
      acc.set(c, (acc.get(c) ?? 0) + d.value);
    }
    rows = [...acc]
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
    columns = [col('category', 'Categoria'), col('value', 'Valor consumido', 'money')];
  } else {
    rows = data
      .map((d) => {
        const p = info.get(d.productId)!;
        return {
          code: p.code,
          product: p.name,
          category: p.category.name,
          qty: round(d.qty, 3),
          unit: p.stockUnit.symbol,
          value: d.value,
        };
      })
      .sort((a, b) => b.value - a.value);
    columns = [
      col('code', 'Código'),
      col('product', 'Produto'),
      col('category', 'Categoria'),
      col('qty', 'Quantidade', 'qty'),
      col('unit', 'Un.'),
      col('value', 'Valor consumido', 'money'),
    ];
  }
  return {
    title: 'Consumo',
    columns,
    rows,
    totals: { [columns[0]!.key]: 'Total', value: sum(rows, 'value') },
    notes:
      'Vendas (via fichas técnicas) e consumos internos, líquidos de estornos, ao custo médio.',
  };
}

// ---------- 3. Rotação, cobertura e parados ----------
async function rotation(auth: AuthContext, f: Filters): Promise<Report> {
  const p = period(f);
  const where = await scopeWhere(auth, f);
  const [cons, balances, lastOut] = await Promise.all([
    consumptionByProduct(auth, f),
    auth.db.stockBalance.groupBy({
      by: ['productId'],
      where: { ...where, product: { ...where.product, active: true } },
      _sum: { qty: true },
    }),
    auth.db.stockMovement.groupBy({
      by: ['productId'],
      where: { type: { in: OUTFLOWS }, ...where },
      _max: { occurredAt: true },
    }),
  ]);
  const units = scopeUnits(auth, f);
  const costs = await auth.db.stockCost.findMany({ where: units ? { unitId: { in: units } } : {} });
  const avg = new Map<string, { q: number; v: number }>();
  for (const c of costs) {
    const a = avg.get(c.productId) ?? { q: 0, v: 0 };
    if (c.qty.gt(0))
      avg.set(c.productId, { q: a.q + c.qty.toNumber(), v: a.v + c.qty.mul(c.avgCost).toNumber() });
  }
  const consMap = new Map(cons.map((c) => [c.productId, c]));
  const last = new Map(lastOut.map((l) => [l.productId, l._max.occurredAt]));
  const ids = [...new Set([...balances.map((b) => b.productId), ...cons.map((c) => c.productId)])];
  const info = await productInfo(auth, ids);
  const qtyMap = new Map(balances.map((b) => [b.productId, b._sum.qty?.toNumber() ?? 0]));

  const rows = ids
    .filter((id) => info.has(id))
    .map((id) => {
      const pr = info.get(id)!;
      const qty = qtyMap.get(id) ?? 0;
      const a = avg.get(id);
      const value = a && a.q ? round((qty * a.v) / a.q) : 0;
      const c = consMap.get(id);
      const daily = c ? c.qty / p.days : 0;
      const lastDate = last.get(id) ?? null;
      const stagnant = qty > 0 && !(lastDate && lastDate >= p.gte);
      return {
        code: pr.code,
        product: pr.name,
        qty: round(qty, 3),
        unit: pr.stockUnit.symbol,
        value,
        consumed: round(c?.qty ?? 0, 3),
        daily: round(daily, 3),
        coverage: daily > 0 ? round(qty / daily, 1) : null,
        turnover: value > 0 && c ? round(c.value / value, 2) : null,
        lastOut: lastDate ? lastDate.toISOString() : null,
        stagnant: stagnant ? 'Sim' : '',
      };
    })
    .filter((r) => f.stagnantOnly !== 'true' || r.stagnant)
    .sort((a, b) => (b.coverage ?? Infinity) - (a.coverage ?? Infinity));
  return {
    title: f.stagnantOnly === 'true' ? 'Produtos parados' : 'Rotação e cobertura',
    columns: [
      col('code', 'Código'),
      col('product', 'Produto'),
      col('qty', 'Stock', 'qty'),
      col('unit', 'Un.'),
      col('value', 'Valor', 'money'),
      col('consumed', 'Consumo', 'qty'),
      col('daily', 'Média/dia', 'qty'),
      col('coverage', 'Cobertura (dias)', 'qty'),
      col('turnover', 'Rotação', 'qty'),
      col('lastOut', 'Última saída', 'date'),
      col('stagnant', 'Parado'),
    ],
    rows,
    notes: `Período de ${p.days} dias. Rotação = valor consumido ÷ valor em stock. Parado = com stock e sem saídas no período.`,
  };
}

// ---------- 4. Quebras ----------
async function waste(auth: AuthContext, f: Filters): Promise<Report> {
  const p = period(f);
  const groups = await auth.db.stockMovement.groupBy({
    by: ['reason', 'productId', 'userId'],
    where: { type: 'WASTE', occurredAt: { gte: p.gte, lt: p.lt }, ...(await scopeWhere(auth, f)) },
    _sum: { qty: true, totalCost: true },
    _count: { _all: true },
  });
  const info = await productInfo(
    auth,
    groups.map((g) => g.productId),
  );
  const users = new Map(
    (await auth.db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const rows = groups
    .map((g) => {
      const pr = info.get(g.productId)!;
      return {
        reason: g.reason ?? '—',
        product: pr.name,
        user: g.userId ? (users.get(g.userId) ?? '') : '',
        qty: round(-(g._sum.qty?.toNumber() ?? 0), 3),
        unit: pr.stockUnit.symbol,
        count: g._count._all,
        value: -(g._sum.totalCost ?? 0),
      };
    })
    .filter((r) => r.qty !== 0)
    .sort((a, b) => b.value - a.value);
  return {
    title: 'Quebras e desperdício',
    columns: [
      col('reason', 'Motivo'),
      col('product', 'Produto'),
      col('user', 'Responsável'),
      col('count', 'Registos', 'int'),
      col('qty', 'Quantidade', 'qty'),
      col('unit', 'Un.'),
      col('value', 'Valor', 'money'),
    ],
    rows,
    totals: { reason: 'Total', value: sum(rows, 'value') },
  };
}

// ---------- 5. Desvios de inventário ----------
async function inventoryVariances(auth: AuthContext, f: Filters): Promise<Report> {
  const p = period(f);
  const where = await scopeWhere(auth, f);
  const lines = await auth.db.inventoryCountLine.findMany({
    where: {
      countedQty: { not: null },
      expectedQty: { not: null },
      count: { status: 'CLOSED', closedAt: { gte: p.gte, lt: p.lt }, location: where.location },
      product: where.product,
    },
    include: {
      count: {
        select: {
          number: true,
          closedAt: true,
          location: { select: { name: true, unit: { select: { name: true } } } },
        },
      },
      product: { select: { code: true, name: true, stockUnit: { select: { symbol: true } } } },
    },
  });
  const rows = lines
    .map((l) => {
      const diff = l.countedQty!.sub(l.expectedQty!);
      const exp = l.expectedQty!.toNumber();
      return {
        date: l.count.closedAt!.toISOString(),
        count: l.count.number,
        location: `${l.count.location.unit.name} · ${l.count.location.name}`,
        product: `${l.product.code} · ${l.product.name}`,
        expected: exp,
        counted: l.countedQty!.toNumber(),
        diff: diff.toNumber(),
        unit: l.product.stockUnit.symbol,
        pct: exp ? round((diff.toNumber() / exp) * 100, 1) : null,
        value: diff
          .mul(l.unitCost ?? 0)
          .toDecimalPlaces(0)
          .toNumber(),
      };
    })
    .filter((r) => r.diff !== 0)
    .sort((a, b) => a.value - b.value);
  return {
    title: 'Desvios de inventário',
    columns: [
      col('date', 'Data', 'date'),
      col('count', 'Nº', 'int'),
      col('location', 'Local'),
      col('product', 'Produto'),
      col('expected', 'Teórico', 'qty'),
      col('counted', 'Contado', 'qty'),
      col('diff', 'Desvio', 'qty'),
      col('unit', 'Un.'),
      col('pct', 'Desvio %', 'pct'),
      col('value', 'Valor', 'money'),
    ],
    rows,
    totals: { location: 'Total', value: sum(rows, 'value') },
    notes: 'Desvio negativo = falta (perda). Valor ao custo médio no fecho.',
  };
}

// ---------- 6. Compras por fornecedor ----------
async function purchasesBySupplier(auth: AuthContext, f: Filters): Promise<Report> {
  const p = period(f);
  const units = scopeUnits(auth, f);
  const groups = await auth.db.goodsReceipt.groupBy({
    by: ['supplierId'],
    where: {
      status: 'POSTED',
      receivedAt: { gte: p.gte, lt: p.lt },
      location: {
        ...(units && { unitId: { in: units } }),
        ...(f.locationId && { id: f.locationId }),
      },
    },
    _sum: { totalAmount: true },
    _count: { _all: true },
  });
  const suppliers = new Map(
    (await auth.db.supplier.findMany({ select: { id: true, name: true } })).map((s) => [
      s.id,
      s.name,
    ]),
  );
  const total = groups.reduce((s, g) => s + (g._sum.totalAmount ?? 0), 0);
  const rows = groups
    .map((g) => ({
      supplier: suppliers.get(g.supplierId) ?? '',
      receipts: g._count._all,
      total: g._sum.totalAmount ?? 0,
      share: total ? round(((g._sum.totalAmount ?? 0) / total) * 100, 1) : 0,
    }))
    .sort((a, b) => b.total - a.total);
  return {
    title: 'Compras por fornecedor',
    columns: [
      col('supplier', 'Fornecedor'),
      col('receipts', 'Recepções', 'int'),
      col('total', 'Total', 'money'),
      col('share', 'Peso', 'pct'),
    ],
    rows,
    totals: { supplier: 'Total', receipts: sum(rows, 'receipts'), total },
  };
}

// ---------- 7. Evolução de preços ----------
async function priceEvolution(auth: AuthContext, f: Filters): Promise<Report> {
  const p = period(f);
  const where = await scopeWhere(auth, f);
  const lines = await auth.db.goodsReceiptLine.findMany({
    where: {
      receipt: { status: 'POSTED', receivedAt: { gte: p.gte, lt: p.lt }, location: where.location },
      product: where.product,
    },
    include: {
      receipt: { select: { receivedAt: true, supplier: { select: { name: true } } } },
      product: {
        select: {
          code: true,
          name: true,
          stockUnitId: true,
          stockUnit: { select: { symbol: true } },
          conversions: true,
        },
      },
      unit: { select: { symbol: true } },
    },
    orderBy: { receipt: { receivedAt: 'asc' } },
  });
  const rows = lines
    .map((l) => {
      const factor =
        l.unitId === l.product.stockUnitId
          ? new D(1)
          : (l.product.conversions.find((c) => c.unitId === l.unitId)?.factor ?? new D(1));
      return {
        product: `${l.product.code} · ${l.product.name}`,
        date: l.receipt.receivedAt.toISOString(),
        supplier: l.receipt.supplier.name,
        qty: l.qty.toNumber(),
        unit: l.unit.symbol,
        unitPrice: l.unitPrice,
        stockPrice: new D(l.unitPrice).div(factor).toDecimalPlaces(2).toNumber(),
        stockUnit: l.product.stockUnit.symbol,
      };
    })
    .sort((a, b) => a.product.localeCompare(b.product) || a.date.localeCompare(b.date));
  return {
    title: 'Evolução de preços de compra',
    columns: [
      col('product', 'Produto'),
      col('date', 'Data', 'date'),
      col('supplier', 'Fornecedor'),
      col('qty', 'Qtd.', 'qty'),
      col('unit', 'Un.'),
      col('unitPrice', 'Preço', 'money'),
      col('stockPrice', 'Preço / un. stock', 'cost'),
      col('stockUnit', 'Un. stock'),
    ],
    rows,
  };
}

// ---------- 8. Custo teórico das vendas e margem ----------
async function salesMargin(auth: AuthContext, f: Filters): Promise<Report> {
  const p = period(f);
  const units = scopeUnits(auth, f);
  const groups = await auth.db.salesImportLine.groupBy({
    by: ['saleItemId'],
    where: {
      saleItemId: { not: null },
      postedAt: { not: null },
      saleDate: { gte: new Date(p.from), lte: new Date(p.to) },
      import: { status: 'CONFIRMED', ...(units && { unitId: { in: units } }) },
    },
    _sum: { qty: true, amount: true },
  });
  const [book, avg] = await Promise.all([loadRecipeBook(auth.db), averageCosts(auth.db, f.unitId)]);
  const rows = groups
    .map((g) => {
      const item = book.items.get(g.saleItemId!)!;
      const qty = g._sum.qty?.toNumber() ?? 0;
      const revenue = g._sum.amount ?? 0;
      let unitCost = 0;
      try {
        unitCost = theoreticalCost(book, item.id, avg).total.toNumber();
      } catch {
        /* ficha inválida: custo 0 */
      }
      const cost = round(qty * unitCost);
      return {
        code: item.code,
        item: item.name,
        qty: round(qty, 3),
        revenue,
        unitCost: round(unitCost, 2),
        cost,
        margin: revenue - cost,
        marginPct: revenue ? round(((revenue - cost) / revenue) * 100, 1) : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const revenue = sum(rows, 'revenue');
  const cost = sum(rows, 'cost');
  return {
    title: 'Custo teórico das vendas e margem',
    columns: [
      col('code', 'Código'),
      col('item', 'Artigo'),
      col('qty', 'Qtd. vendida', 'qty'),
      col('revenue', 'Vendas', 'money'),
      col('unitCost', 'Custo unit.', 'cost'),
      col('cost', 'Custo teórico', 'money'),
      col('margin', 'Margem', 'money'),
      col('marginPct', 'Margem %', 'pct'),
    ],
    rows,
    totals: {
      item: 'Total',
      revenue,
      cost,
      margin: revenue - cost,
      marginPct: revenue ? round(((revenue - cost) / revenue) * 100, 1) : null,
    },
    notes:
      'Vendas das importações POS confirmadas. Custo teórico com o custo médio actual das fichas técnicas.',
  };
}

// ---------- 9. Comparativo entre unidades ----------
async function unitsComparison(auth: AuthContext, f: Filters): Promise<Report> {
  const p = period(f);
  const units = (
    await auth.db.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  ).filter((u) => auth.unitIds === 'all' || auth.unitIds.includes(u.id));
  const rows: Row[] = [];
  for (const u of units) {
    const range = { gte: p.gte, lt: p.lt };
    const mv = (types: MovementType[]) =>
      auth.db.stockMovement.aggregate({
        where: { type: { in: types }, occurredAt: range, location: { unitId: u.id } },
        _sum: { totalCost: true },
      });
    const [costs, cons, wst, purch, inv] = await Promise.all([
      auth.db.stockCost.findMany({ where: { unitId: u.id, qty: { gt: 0 } } }),
      mv(CONSUMPTION),
      mv(['WASTE']),
      auth.db.goodsReceipt.aggregate({
        where: { status: 'POSTED', receivedAt: range, location: { unitId: u.id } },
        _sum: { totalAmount: true },
      }),
      auth.db.stockMovement.aggregate({
        where: { type: 'INVENTORY_ADJUST', occurredAt: range, location: { unitId: u.id } },
        _sum: { totalCost: true },
      }),
    ]);
    const consumption = -(cons._sum.totalCost ?? 0);
    const wasteV = -(wst._sum.totalCost ?? 0);
    rows.push({
      unit: u.name,
      stock: costs.reduce((s, c) => s + c.qty.mul(c.avgCost).toNumber(), 0),
      purchases: purch._sum.totalAmount ?? 0,
      consumption,
      waste: wasteV,
      wastePct: consumption ? round((wasteV / consumption) * 100, 1) : null,
      inventory: inv._sum.totalCost ?? 0,
    });
  }
  rows.forEach((r) => (r.stock = round(Number(r.stock))));
  return {
    title: 'Comparativo entre unidades',
    columns: [
      col('unit', 'Unidade'),
      col('stock', 'Valor em stock', 'money'),
      col('purchases', 'Compras', 'money'),
      col('consumption', 'Consumo', 'money'),
      col('waste', 'Quebras', 'money'),
      col('wastePct', 'Quebras / consumo', 'pct'),
      col('inventory', 'Acertos de inventário', 'money'),
    ],
    rows,
    totals: Object.fromEntries([
      ['unit', 'Total'],
      ...['stock', 'purchases', 'consumption', 'waste', 'inventory'].map((k) => [k, sum(rows, k)]),
    ]),
  };
}

// ---------- 10. Curva ABC ----------
async function abc(auth: AuthContext, f: Filters): Promise<Report> {
  const data = (await consumptionByProduct(auth, f))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const info = await productInfo(
    auth,
    data.map((d) => d.productId),
  );
  const total = data.reduce((s, d) => s + d.value, 0);
  let acc = 0;
  const rows = data.map((d, i) => {
    acc += d.value;
    const cum = total ? (acc / total) * 100 : 0;
    const before = total ? ((acc - d.value) / total) * 100 : 0;
    const p = info.get(d.productId)!;
    return {
      rank: i + 1,
      code: p.code,
      product: p.name,
      value: d.value,
      share: total ? round((d.value / total) * 100, 2) : 0,
      cumulative: round(cum, 2),
      class: before < f.a ? 'A' : before < f.b ? 'B' : 'C',
    };
  });
  return {
    title: 'Curva ABC (valor de consumo)',
    columns: [
      col('rank', '#', 'int'),
      col('code', 'Código'),
      col('product', 'Produto'),
      col('value', 'Valor consumido', 'money'),
      col('share', '%', 'pct'),
      col('cumulative', '% acumulada', 'pct'),
      col('class', 'Classe'),
    ],
    rows,
    totals: { product: 'Total', value: total },
    notes: `A: até ${f.a}% do valor acumulado; B: até ${f.b}%; C: restante.`,
  };
}

// ---------- 11–12. Contas a pagar ----------
const AGING = [
  ['notDue', 'Não vencido'],
  ['d30', '0–30 dias'],
  ['d60', '31–60 dias'],
  ['d90', '61–90 dias'],
  ['d90plus', '+90 dias'],
] as const;

async function openPayables(auth: AuthContext, f: Filters) {
  const units = scopeUnits(auth, f);
  return auth.db.payable.findMany({
    where: { status: { in: ['OPEN', 'PARTIAL'] }, ...(units && { unitId: { in: units } }) },
    include: { supplier: { select: { name: true } } },
  });
}

/** Dívida por fornecedor e antiguidade (dias desde o vencimento) à data de hoje. */
async function payablesAging(auth: AuthContext, f: Filters): Promise<Report> {
  const today = new Date(period({ ...f, from: undefined }).to);
  const acc = new Map<string, Row>();
  for (const p of await openPayables(auth, f)) {
    const late = Math.floor((today.getTime() - p.dueDate.getTime()) / 86_400_000);
    const bucket =
      late <= 0
        ? 'notDue'
        : late <= 30
          ? 'd30'
          : late <= 60
            ? 'd60'
            : late <= 90
              ? 'd90'
              : 'd90plus';
    const r = acc.get(p.supplierId) ?? {
      supplier: p.supplier.name,
      notDue: 0,
      d30: 0,
      d60: 0,
      d90: 0,
      d90plus: 0,
      total: 0,
    };
    const due = p.amount - p.paidAmount;
    r[bucket] = Number(r[bucket]) + due;
    r.total = Number(r.total) + due;
    acc.set(p.supplierId, r);
  }
  const rows = [...acc.values()].sort((a, b) => Number(b.total) - Number(a.total));
  const keys = [...AGING.map(([k]) => k), 'total'];
  return {
    title: 'Contas a pagar — dívida por fornecedor e antiguidade',
    columns: [
      col('supplier', 'Fornecedor'),
      ...AGING.map(([k, l]) => col(k, l, 'money')),
      col('total', 'Total', 'money'),
    ],
    rows,
    totals: Object.fromEntries([['supplier', 'Total'], ...keys.map((k) => [k, sum(rows, k)])]),
    notes: 'Antiguidade contada a partir da data de vencimento.',
  };
}

/** Previsão de pagamentos por semana de vencimento (vencidas na primeira linha). */
async function payablesForecast(auth: AuthContext, f: Filters): Promise<Report> {
  const today = period({ ...f, from: undefined }).to;
  const monday = (d: string) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  const acc = new Map<string, { week: string; count: number; amount: number }>();
  for (const p of await openPayables(auth, f)) {
    const due = p.dueDate.toISOString().slice(0, 10);
    const week = due < today ? 'Vencidas' : monday(due);
    const r = acc.get(week) ?? { week, count: 0, amount: 0 };
    r.count++;
    r.amount += p.amount - p.paidAmount;
    acc.set(week, r);
  }
  const rows = [...acc.values()]
    .sort((a, b) =>
      a.week === 'Vencidas' ? -1 : b.week === 'Vencidas' ? 1 : a.week.localeCompare(b.week),
    )
    .map((r) => ({
      ...r,
      week: r.week === 'Vencidas' ? r.week : `Semana de ${r.week.split('-').reverse().join('/')}`,
    }));
  return {
    title: 'Previsão de pagamentos',
    columns: [
      col('week', 'Vencimento'),
      col('count', 'Contas', 'int'),
      col('amount', 'Valor', 'money'),
    ],
    rows,
    totals: { week: 'Total', count: sum(rows, 'count'), amount: sum(rows, 'amount') },
  };
}

// ---------- 13. Resultados financeiros ----------
async function financialResults(auth: AuthContext, f: Filters): Promise<Report> {
  const p = period(f);
  const cells = await dailyCells(auth, p.from, p.to, scopeUnits(auth, f));
  const group = f.group === 'month' ? 'month' : f.group === 'unit' ? 'unit' : 'day';
  const units = new Map(
    (await auth.db.unit.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const buckets = new Map<string, Cell[]>();
  for (const [k, c] of cells) {
    const [unitId, d] = k.split('|') as [string, string];
    const key =
      group === 'unit' ? (units.get(unitId) ?? unitId) : group === 'month' ? d.slice(0, 7) : d;
    buckets.set(key, [...(buckets.get(key) ?? []), c]);
  }
  const rows: Row[] = [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, cs]) => ({
      period:
        group === 'day'
          ? key.split('-').reverse().join('/')
          : group === 'month'
            ? key.split('-').reverse().join('/')
            : key,
      ...metrics(sumCells(cs)),
    }));
  const total = metrics(sumCells(cells.values()));
  return {
    title: 'Resultados financeiros',
    columns: [
      col('period', group === 'unit' ? 'Unidade' : group === 'month' ? 'Mês' : 'Dia'),
      col('revenue', 'Receita', 'money'),
      col('cogs', 'CMV vendas', 'money'),
      col('waste', 'Quebras', 'money'),
      col('opex', 'Custos operacionais', 'money'),
      col('personnel', 'Custo de pessoal', 'money'),
      col('result', 'Resultado', 'money'),
      col('cmvPct', 'CMV %', 'pct'),
      col('personnelPct', 'Pessoal %', 'pct'),
    ],
    rows,
    totals: { period: 'Total', ...total },
    notes: `Ponto de equilíbrio no período: ${total.breakEven == null ? '—' : new Intl.NumberFormat('pt-AO').format(total.breakEven) + ' Kz'} de receita. Custo de pessoal = salários aprovados (bruto + INSS da entidade), rateado por dia.`,
  };
}

export const REPORTS = {
  stock: { title: 'Stock actual', run: stock, period: false },
  consumption: { title: 'Consumo', run: consumption, period: true },
  rotation: { title: 'Rotação, cobertura e parados', run: rotation, period: true },
  waste: { title: 'Quebras e desperdício', run: waste, period: true },
  'inventory-variances': { title: 'Desvios de inventário', run: inventoryVariances, period: true },
  'purchases-by-supplier': {
    title: 'Compras por fornecedor',
    run: purchasesBySupplier,
    period: true,
  },
  'price-evolution': { title: 'Evolução de preços', run: priceEvolution, period: true },
  'sales-margin': { title: 'Custo das vendas e margem', run: salesMargin, period: true },
  'units-comparison': { title: 'Comparativo entre unidades', run: unitsComparison, period: true },
  abc: { title: 'Curva ABC', run: abc, period: true },
  'payables-aging': {
    title: 'Contas a pagar: antiguidade',
    run: payablesAging,
    period: false,
    feature: 'payables',
  },
  'payables-forecast': {
    title: 'Previsão de pagamentos',
    run: payablesForecast,
    period: false,
    feature: 'payables',
  },
  'financial-results': {
    title: 'Resultados financeiros',
    run: financialResults,
    period: true,
    feature: 'financial_results',
  },
} as const satisfies Record<
  string,
  {
    title: string;
    run: (a: AuthContext, f: Filters) => Promise<Report>;
    period: boolean;
    feature?: Feature;
  }
>;
export type ReportName = keyof typeof REPORTS;
