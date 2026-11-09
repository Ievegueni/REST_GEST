import { z } from 'zod';
import type { AuthContext } from '../../core/auth';
import { optText } from '../../core/schemas';
import { nextNumber } from '../../core/sequence';
import type { Tx } from '../stock/engine';
import { postPending } from './service';

/**
 * Vendas em tempo real enviadas pelo agente POS local.
 * Cada factura fechada entra numa importação "do dia" da unidade (uma por dia de negócio),
 * já confirmada: a receita aparece logo nos resultados e o stock é lançado pelas fichas técnicas.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const posId = z.string().trim().min(1).max(40);

export const agentSalesSchema = z.object({
  /** sistema POS: os mapeamentos de artigos são partilhados com as importações Excel do mesmo POS */
  posName: z.string().trim().min(1).max(50),
  /** marca do POS a guardar quando este lote for aceite (o agente retoma daqui) */
  cursor: z.string().max(40).nullable(),
  docs: z
    .array(
      z.object({
        id: posId,
        number: optText(40),
        table: optText(20),
        businessDate: day,
        closedAt: z.coerce.date(),
        total: z.number(),
        internal: z.boolean().default(false),
        lines: z
          .array(
            z.object({
              code: z.string().trim().min(1).max(50),
              label: optText(200),
              qty: z.number().min(-1e6).max(1e6),
              /** sem impostos */
              amount: z.number(),
              /** com impostos */
              gross: z.number(),
            }),
          )
          .max(500),
        payments: z
          .array(
            z.object({
              code: z.string().trim().min(1).max(20),
              name: optText(100),
              amount: z.number(),
            }),
          )
          .max(20),
      }),
    )
    .max(200),
  /** facturas anuladas depois de fechadas */
  cancelled: z.array(posId).max(1000).default([]),
});
export type AgentSales = z.infer<typeof agentSalesSchema>;

/** Perfil técnico das importações do agente (inactivo: não aparece no upload de ficheiros). */
async function agentProfile(auth: AuthContext, posName: string) {
  const name = `${posName} (agente POS)`;
  return (
    (await auth.db.importProfile.findFirst({ where: { name } })) ??
    auth.db.importProfile.create({ data: { name, posName, columns: {}, active: false } })
  );
}

/** Importação do dia para as vendas do agente; null se o dia já foi importado por ficheiro. */
async function dayImport(tx: Tx, auth: AuthContext, unitId: string, profileId: string, d: string) {
  const date = new Date(d);
  const own = await tx.salesImport.findFirst({
    where: { unitId, profileId, periodFrom: date, status: 'CONFIRMED' },
  });
  if (own) return own.id;
  const other = await tx.salesImport.count({
    where: {
      unitId,
      status: { in: ['READY', 'CONFIRMED'] },
      periodFrom: { lte: date },
      periodTo: { gte: date },
    },
  });
  if (other) return null;
  const now = new Date();
  const imp = await tx.salesImport.create({
    data: {
      number: await nextNumber(tx, auth.tenantId, 'SI'),
      unitId,
      profileId,
      fileName: `Vendas em tempo real ${d.split('-').reverse().join('/')}`,
      fileHash: `agent:${unitId}:${d}`,
      status: 'CONFIRMED',
      periodFrom: date,
      periodTo: date,
      createdById: auth.userId,
      confirmedAt: now,
      confirmedById: auth.userId,
    },
  });
  return imp.id;
}

export async function ingestAgentSales(auth: AuthContext, unitId: string, input: AgentSales) {
  const db = auth.db;
  const profile = await agentProfile(auth, input.posName);
  const known = new Set(
    (
      await db.posDocument.findMany({
        where: { unitId, posDocId: { in: input.docs.map((d) => d.id) } },
        select: { posDocId: true },
      })
    ).map((d) => d.posDocId),
  );
  const result = { accepted: 0, duplicates: 0, cancelled: 0, skippedDays: [] as string[] };
  const touched = new Set<string>();

  await db.$transaction(
    async (tx) => {
      const imports = new Map<string, string | null>();
      for (const d of input.docs) {
        if (known.has(d.id)) {
          result.duplicates++;
          continue;
        }
        if (!imports.has(d.businessDate))
          imports.set(
            d.businessDate,
            await dayImport(tx, auth, unitId, profile.id, d.businessDate),
          );
        const importId = imports.get(d.businessDate);
        if (!importId) {
          if (!result.skippedDays.includes(d.businessDate)) result.skippedDays.push(d.businessDate);
          continue;
        }
        const saleDate = new Date(d.businessDate);
        const doc = await tx.posDocument.create({
          data: {
            unitId,
            posDocId: d.id,
            number: d.number,
            table: d.table,
            businessDate: saleDate,
            closedAt: d.closedAt,
            total: Math.round(d.total),
            internal: d.internal,
            importId,
          },
        });
        await tx.posPayment.createMany({
          data: d.payments.map((p) => ({
            documentId: doc.id,
            methodCode: p.code,
            methodName: p.name,
            amount: Math.round(p.amount),
          })),
        });
        // consumo interno: baixa stock pelas fichas, mas sem receita
        await tx.salesImportLine.createMany({
          data: d.lines.map((l, i) => ({
            importId,
            rowNumber: i + 1,
            posCode: l.code,
            posLabel: l.label,
            qty: l.qty,
            amount: d.internal ? 0 : Math.round(l.amount),
            grossAmount: d.internal ? 0 : Math.round(l.gross),
            saleDate,
            posDocId: d.id,
          })),
        });
        touched.add(importId);
        known.add(d.id);
        result.accepted++;
      }

      // anulada depois de fechada: linhas simétricas no mesmo dia (receita e stock voltam)
      for (const id of input.cancelled) {
        const doc = await tx.posDocument.findFirst({
          where: { unitId, posDocId: id, cancelledAt: null, importId: { not: null } },
        });
        if (!doc) continue;
        const imp = await tx.salesImport.findUniqueOrThrow({ where: { id: doc.importId! } });
        if (imp.status !== 'CONFIRMED') continue;
        const lines = await tx.salesImportLine.findMany({
          where: { importId: imp.id, posDocId: id },
        });
        await tx.salesImportLine.createMany({
          data: lines.map((l) => ({
            importId: l.importId,
            rowNumber: l.rowNumber,
            posCode: l.posCode,
            posLabel: l.posLabel,
            qty: l.qty.neg(),
            amount: -l.amount,
            grossAmount: l.grossAmount == null ? null : -l.grossAmount,
            saleDate: l.saleDate,
            posDocId: id,
          })),
        });
        await tx.posDocument.update({ where: { id: doc.id }, data: { cancelledAt: new Date() } });
        touched.add(imp.id);
        result.cancelled++;
      }

      for (const id of touched) {
        const agg = await tx.salesImportLine.aggregate({
          where: { importId: id },
          _sum: { amount: true },
          _count: { _all: true },
        });
        await tx.salesImport.update({
          where: { id },
          data: { rowCount: agg._count._all, totalAmount: agg._sum.amount ?? 0 },
        });
      }
      if (input.cursor)
        await tx.unit.update({ where: { id: unitId }, data: { posSalesCursor: input.cursor } });
    },
    { timeout: 60_000 },
  );

  // Lançamento em stock fora da transacção: uma ficha ou local de saída em falta não perde as vendas
  // (ficam pendentes, como nas importações por ficheiro, e o erro fica visível na importação).
  for (const id of touched) {
    try {
      await postPending(auth, id);
      await db.salesImport.update({ where: { id }, data: { errors: [] } });
    } catch (e) {
      await db.salesImport.update({
        where: { id },
        data: { errors: [{ row: 0, message: (e as Error).message }] },
      });
    }
  }
  return result;
}
