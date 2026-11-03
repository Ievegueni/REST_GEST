import type { AuthContext } from '../../core/auth';

/**
 * Caixa do dia a partir das importações de vendas do POS.
 * O ficheiro não traz meio de pagamento: o total do dia entra numa linha "Vendas POS".
 * Caixa criada aqui fica logo fechada (registo da receita, sem contagem).
 * O valor é sempre recalculado a partir de todas as importações confirmadas do dia,
 * por isso confirmar/anular/reimportar dá sempre o mesmo resultado.
 */
export const POS_METHOD_NAME = 'Vendas POS';
export const AUTO_NOTE = 'Criada automaticamente pela importação de vendas.';

export async function syncDailyCashFromSales(auth: AuthContext, unitId: string, days: Date[]) {
  if (!auth.features.has('cash_closing') || !days.length) return;
  const db = auth.db;
  const keys = [...new Set(days.map((d) => d.toISOString().slice(0, 10)))];

  await db.$transaction(async (tx) => {
    const method =
      (await tx.paymentMethod.findFirst({ where: { name: POS_METHOD_NAME } })) ??
      (await tx.paymentMethod.create({ data: { name: POS_METHOD_NAME, isCash: false } }));

    for (const key of keys) {
      const businessDate = new Date(`${key}T00:00:00Z`);
      const agg = await tx.salesImportLine.aggregate({
        _sum: { amount: true },
        where: { saleDate: businessDate, import: { unitId, status: 'CONFIRMED' } },
      });
      const total = agg._sum.amount ?? 0;

      const session = await tx.cashSession.findFirst({
        where: { unitId, businessDate, shift: '' },
        include: { amounts: true, movements: { select: { id: true } } },
      });

      if (!session) {
        if (!total) continue;
        const now = new Date();
        const created = await tx.cashSession.create({
          data: {
            unitId,
            businessDate,
            openingFloat: 0,
            status: 'CLOSED',
            difference: 0,
            notes: AUTO_NOTE,
            openedById: auth.userId,
            closedById: auth.userId,
            closedAt: now,
          },
        });
        await tx.cashSessionAmount.create({
          data: {
            sessionId: created.id,
            paymentMethodId: method.id,
            systemAmount: total,
            countedAmount: total,
          },
        });
        continue;
      }

      // Caixa automática que ficou sem vendas (importação anulada) e sem mais nada: apaga.
      const others = session.amounts.filter((a) => a.paymentMethodId !== method.id);
      if (!total && session.notes === AUTO_NOTE && !others.length && !session.movements.length) {
        await tx.cashSession.delete({ where: { id: session.id } });
        continue;
      }

      await tx.cashSessionAmount.upsert({
        where: {
          sessionId_paymentMethodId: { sessionId: session.id, paymentMethodId: method.id },
        },
        create: {
          sessionId: session.id,
          paymentMethodId: method.id,
          systemAmount: total,
          countedAmount: total,
        },
        update: { systemAmount: total, countedAmount: total },
      });
    }
  });
}
