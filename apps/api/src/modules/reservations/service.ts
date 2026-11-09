import type { AuthContext } from '../../core/auth';

/**
 * Sincroniza o estado das mesas com a lista de mesas abertas no POS (fotografia completa).
 * - aberta no POS e livre aqui → cliente sem reserva sentado;
 * - aberta no POS e já sentada aqui → marca como vista no POS;
 * - fechada no POS e vista antes no POS → liberta.
 * Mesas sentadas à mão que o POS ainda não abriu ficam como estão.
 */
export async function syncPosTables(auth: AuthContext, unitId: string, open: string[]) {
  const names = new Set(open.map((n) => n.trim()).filter(Boolean));
  const [tables, seated] = await Promise.all([
    auth.db.diningTable.findMany({ where: { unitId, active: true } }),
    auth.db.reservation.findMany({ where: { unitId, status: 'SEATED' } }),
  ]);
  const now = new Date();
  let opened = 0;
  let closed = 0;
  for (const t of tables) {
    const occ = seated.find((r) => r.tableId === t.id);
    if (names.has(t.name)) {
      if (!occ) {
        await auth.db.reservation.create({
          data: {
            unitId,
            tableId: t.id,
            customerName: 'Aberta no POS',
            partySize: t.seats,
            startsAt: now,
            seatedAt: now,
            status: 'SEATED',
            walkIn: true,
            posSeen: true,
            createdById: auth.userId,
          },
        });
        opened++;
      } else if (!occ.posSeen)
        await auth.db.reservation.update({ where: { id: occ.id }, data: { posSeen: true } });
    } else if (occ?.posSeen) {
      await auth.db.reservation.update({
        where: { id: occ.id },
        data: { status: 'DONE', closedAt: now },
      });
      closed++;
    }
  }
  const known = new Set(tables.map((t) => t.name));
  return { opened, closed, unknown: [...names].filter((n) => !known.has(n)) };
}
