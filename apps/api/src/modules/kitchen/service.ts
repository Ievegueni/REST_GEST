import { z } from 'zod';
import type { AuthContext } from '../../core/auth';
import { env } from '../../core/env';

/** Linhas das mesas abertas no POS (fotografia completa), enviadas pelo agente. */
export const kitchenSnapshotSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        docId: z.string().min(1).max(40),
        round: z.string().min(1).max(40),
        zone: z.string().trim().min(1).max(50),
        table: z.string().max(20).nullable(),
        waiter: z.string().trim().max(80).nullish(),
        code: z.string().max(50),
        label: z.string().max(200),
        qty: z.number().min(-1e6).max(1e6),
        position: z.number().int().default(0),
        cancelled: z.boolean().default(false),
      }),
    )
    .max(5000),
});
type Line = z.infer<typeof kitchenSnapshotSchema>['lines'][number];

/** zona desligada do ecrã (KDS_IGNORED_ZONES) */
export const zoneIgnored = (zone: string) =>
  env.KDS_IGNORED_ZONES.includes(zone.trim().toLowerCase());

const key = (docId: string, round: string, zone: string) => `${docId}|${round}|${zone}`;

/**
 * Sincroniza os talões com as linhas abertas no POS:
 * ronda nova → talão novo (hora = agora); linha nova/alterada → actualiza; linha que saiu → anulada;
 * talão sem linhas no POS (mesa fechada) → sai do ecrã.
 * ponytail: transferência de mesa no POS cria talão novo (perde o estado/hora do antigo).
 */
export async function syncKitchen(auth: AuthContext, unitId: string, lines: Line[]) {
  const db = auth.db;
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    if (zoneIgnored(l.zone)) continue;
    const k = key(l.docId, l.round, l.zone);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const open = await db.kitchenTicket.findMany({
    where: { unitId, closedAt: null },
    include: { items: true },
  });
  const byKey = new Map(open.map((t) => [key(t.posDocId, t.round, t.zone), t]));
  let created = 0;
  let closed = 0;

  for (const [k, ls] of groups) {
    const first = ls[0]!;
    let t = byKey.get(k);
    if (!t) {
      t = await db.kitchenTicket.upsert({
        where: {
          tenantId_unitId_posDocId_round_zone: {
            tenantId: auth.tenantId,
            unitId,
            posDocId: first.docId,
            round: first.round,
            zone: first.zone,
          },
        },
        create: {
          unitId,
          posDocId: first.docId,
          round: first.round,
          zone: first.zone,
          table: first.table,
          waiter: first.waiter,
        },
        update: { closedAt: null, table: first.table, waiter: first.waiter },
        include: { items: true },
      });
      created++;
    }
    const have = new Map(t.items.map((i) => [i.posLineId, i]));
    for (const l of ls) {
      const i = have.get(l.id);
      have.delete(l.id);
      if (!i)
        await db.kitchenItem.create({
          data: {
            ticketId: t.id,
            posLineId: l.id,
            posCode: l.code,
            label: l.label,
            qty: l.qty,
            position: l.position,
            cancelled: l.cancelled,
          },
        });
      else if (!i.qty.eq(l.qty) || i.cancelled !== l.cancelled)
        await db.kitchenItem.update({
          where: { id: i.id },
          data: { qty: l.qty, cancelled: l.cancelled },
        });
    }
    // linhas que deixaram de existir na conta: anuladas
    for (const i of have.values())
      if (!i.cancelled)
        await db.kitchenItem.update({ where: { id: i.id }, data: { cancelled: true } });
  }
  for (const t of open)
    if (!groups.has(key(t.posDocId, t.round, t.zone))) {
      await db.kitchenTicket.update({ where: { id: t.id }, data: { closedAt: new Date() } });
      closed++;
    }
  return { created, closed };
}
