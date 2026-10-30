/**
 * Ferramentas de leitura agregada expostas ao modelo. Correm sempre com o AuthContext do
 * utilizador: tenantDb (isolamento do tenant), unidades acessíveis e permissões/features.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { Feature } from '@restgest/shared';
import { z } from 'zod';
import type { AuthContext } from '../../core/auth';
import { filtersSchema, period, scopeUnits, type Report } from '../reports/common';
import { REPORTS, type ReportName } from '../reports/definitions';
import { suggest } from '../reports/replenishment';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filters = z.object({
  from: day.optional().describe('Início do período (YYYY-MM-DD). Por defeito: há 30 dias.'),
  to: day.optional().describe('Fim do período (YYYY-MM-DD), inclusive. Por defeito: hoje.'),
  unitId: z.string().optional().describe('Id da unidade (ver contexto). Omitir = consolidado.'),
  categoryId: z.string().optional().describe('Id da categoria de produtos (inclui subcategorias).'),
});
const noPeriod = filters.omit({ from: true, to: true });

export type Chart = {
  kind: 'bar' | 'line';
  title: string;
  labels: string[];
  series: { name: string; values: number[] }[];
};
const chartSchema = z.object({
  kind: z.enum(['bar', 'line']),
  title: z.string().max(120),
  labels: z.array(z.string().max(60)).min(1).max(60),
  series: z
    .array(z.object({ name: z.string().max(60), values: z.array(z.number()).max(60) }))
    .min(1)
    .max(3),
});

type ToolDef = {
  description: string;
  input: z.ZodObject;
  feature: Feature;
  /** basta uma */
  permissions: string[];
  run: (auth: AuthContext, input: never, charts: Chart[]) => Promise<unknown>;
};

const MAX_ROWS = 60;

/** Relatório → JSON compacto para o modelo (colunas com tipo, linhas truncadas). */
function compact(r: Report) {
  return {
    title: r.title,
    columns: r.columns.map((c) => `${c.key}: ${c.label} [${c.type}]`),
    rows: r.rows.slice(0, MAX_ROWS),
    ...(r.rows.length > MAX_ROWS && { truncated: `${r.rows.length - MAX_ROWS} linhas omitidas` }),
    totals: r.totals,
    notes: r.notes,
  };
}

const report =
  (name: ReportName) => async (auth: AuthContext, input: Record<string, string | undefined>) =>
    compact(await REPORTS[name].run(auth, filtersSchema.parse(input)));

const stockTool = (description: string, name: ReportName, input: z.ZodObject = filters) => ({
  description,
  input,
  feature: 'reports_stock' as const,
  permissions: ['reports.view'],
  run: report(name),
});

export const TOOLS: Record<string, ToolDef> = {
  get_stock_summary: stockTool(
    'Stock actual: quantidade, custo médio e valor por produto (Kz). Sem período.',
    'stock',
    noPeriod,
  ),
  get_consumption: stockTool(
    'Consumo (saídas por venda, consumo interno, quebras) por produto no período, em quantidade e valor.',
    'consumption',
  ),
  get_waste: stockTool(
    'Quebras e desperdício no período: por produto, motivo e responsável, com valor.',
    'waste',
  ),
  get_inventory_variances: stockTool(
    'Desvios de inventário (teórico vs. contado) nos inventários fechados no período.',
    'inventory-variances',
  ),
  get_sales_by_item: stockTool(
    'Vendas importadas do POS por artigo no período: quantidade, receita, custo teórico e margem.',
    'sales-margin',
  ),
  get_purchases_by_supplier: stockTool(
    'Compras (recepções) por fornecedor no período, em valor.',
    'purchases-by-supplier',
  ),
  get_stock_rotation: stockTool(
    'Rotação, cobertura (dias de stock) e produtos parados no período.',
    'rotation',
  ),
  get_payables_aging: {
    description:
      'Contas a pagar em aberto por fornecedor e antiguidade (não vencido, 0–30, 31–60, 61–90, +90 dias).',
    input: z.object({}),
    feature: 'payables',
    permissions: ['payables.manage', 'financial.view'],
    run: report('payables-aging'),
  },
  get_financial_result: {
    description:
      'Resultado operacional: receita, CMV, quebras, custos operacionais, custo de pessoal, resultado, CMV % e ponto de equilíbrio.',
    input: filters.omit({ categoryId: true }).extend({
      group: z
        .enum(['day', 'month', 'unit'])
        .optional()
        .describe('Agrupar por dia, mês ou unidade'),
    }),
    feature: 'financial_results',
    permissions: ['financial.view'],
    run: report('financial-results'),
  },
  get_daily_costs: {
    description: 'Custos operacionais (custos diários) no período, por unidade e categoria (Kz).',
    input: filters.omit({ categoryId: true }),
    feature: 'daily_costs',
    permissions: ['costs.manage', 'financial.view'],
    run: async (auth, input: z.infer<typeof filters>) => {
      const f = filtersSchema.parse(input);
      const p = period(f);
      const units = scopeUnits(auth, f);
      const rows = await auth.db.dailyCost.groupBy({
        by: ['unitId', 'categoryId'],
        where: {
          date: { gte: new Date(p.from), lte: new Date(p.to) },
          ...(units && { unitId: { in: units } }),
        },
        _sum: { amount: true },
        _count: true,
      });
      const [unitNames, catNames] = await Promise.all([
        auth.db.unit.findMany({ select: { id: true, name: true } }),
        auth.db.costCategory.findMany({ select: { id: true, name: true } }),
      ]);
      const n = (l: { id: string; name: string }[], id: string) => l.find((x) => x.id === id)?.name;
      return {
        period: { from: p.from, to: p.to },
        rows: rows
          .map((r) => ({
            unit: n(unitNames, r.unitId),
            category: n(catNames, r.categoryId),
            entries: r._count,
            amount: r._sum.amount ?? 0,
          }))
          .sort((a, b) => b.amount - a.amount),
        total: rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0),
      };
    },
  },
  get_cash_closings: {
    description:
      'Fechos de caixa no período: data, turno, estado, diferença (contado − esperado, Kz) e justificação.',
    input: filters.omit({ categoryId: true }),
    feature: 'cash_closing',
    permissions: ['cash.close', 'cash.validate', 'financial.view'],
    run: async (auth, input: z.infer<typeof filters>) => {
      const f = filtersSchema.parse(input);
      const p = period(f);
      const units = scopeUnits(auth, f);
      const sessions = await auth.db.cashSession.findMany({
        where: {
          businessDate: { gte: new Date(p.from), lte: new Date(p.to) },
          ...(units && { unitId: { in: units } }),
        },
        select: {
          businessDate: true,
          shift: true,
          status: true,
          difference: true,
          justification: true,
          unit: { select: { name: true } },
        },
        orderBy: { businessDate: 'desc' },
        take: 200,
      });
      const diffs = sessions.map((s) => s.difference ?? 0);
      return {
        period: { from: p.from, to: p.to },
        sessions: sessions.slice(0, MAX_ROWS).map((s) => ({
          unit: s.unit.name,
          date: s.businessDate.toISOString().slice(0, 10),
          shift: s.shift || null,
          status: s.status,
          difference: s.difference,
          justification: s.justification,
        })),
        count: sessions.length,
        totalDifference: diffs.reduce((a, b) => a + b, 0),
        sessionsWithDifference: diffs.filter((d) => d !== 0).length,
      };
    },
  },
  get_consumption_forecast: {
    description:
      'Previsão de consumo e de compras de uma unidade: consumo previsto nos próximos N dias (média dos últimos dias, ponderada por dia da semana), stock actual, encomendas pendentes e quantidade a encomendar.',
    input: z.object({
      unitId: z.string().describe('Id da unidade (obrigatório)'),
      coverageDays: z.number().int().min(1).max(90).default(7).describe('Dias a prever'),
      lookbackDays: z.number().int().min(7).max(180).default(28).describe('Histórico usado'),
    }),
    feature: 'purchases',
    permissions: ['purchases.manage', 'reports.view'],
    run: async (auth, input: { unitId: string; coverageDays: number; lookbackDays: number }) => {
      const rows = await suggest(auth, input);
      return {
        ...input,
        products: rows.slice(0, MAX_ROWS).map((r) => ({
          name: r.name,
          stockUnit: r.stockUnit,
          onHand: r.onHand,
          pending: r.pending,
          forecast: r.forecast,
          need: r.need,
          supplier: r.supplier?.name ?? null,
        })),
        ...(rows.length > MAX_ROWS && { truncated: `${rows.length - MAX_ROWS} produtos omitidos` }),
      };
    },
  },
  show_chart: {
    description:
      'Mostra um gráfico ao utilizador junto da resposta. Usar só com números obtidos das outras ferramentas.',
    input: chartSchema,
    feature: 'ai_analyzer',
    permissions: ['ai.use'],
    run: async (_auth, input: Chart, charts) => {
      charts.push(input);
      return 'Gráfico mostrado ao utilizador.';
    },
  },
};

/** Ferramentas disponíveis para este utilizador (plano + permissões). */
export function toolsFor(auth: AuthContext) {
  return Object.entries(TOOLS).filter(
    ([, t]) => auth.features.has(t.feature) && t.permissions.some((p) => auth.permissions.has(p)),
  );
}

export function toolParams(auth: AuthContext): Anthropic.Beta.BetaTool[] {
  return toolsFor(auth).map(([name, t]) => ({
    name,
    description: t.description,
    input_schema: z.toJSONSchema(t.input, { io: 'input' }) as Anthropic.Beta.BetaTool.InputSchema,
  }));
}

/** Executa uma chamada do modelo; erros voltam como texto (is_error) para o modelo corrigir. */
export async function runTool(auth: AuthContext, name: string, input: unknown, charts: Chart[]) {
  const t = toolsFor(auth).find(([n]) => n === name)?.[1];
  if (!t) return { error: true, content: `Ferramenta indisponível: ${name}` };
  const parsed = t.input.safeParse(input);
  if (!parsed.success)
    return { error: true, content: `Parâmetros inválidos: ${parsed.error.message}` };
  try {
    const out = await t.run(auth, parsed.data as never, charts);
    return { error: false, content: typeof out === 'string' ? out : JSON.stringify(out) };
  } catch (e) {
    return { error: true, content: e instanceof Error ? e.message : 'Erro ao obter os dados' };
  }
}
