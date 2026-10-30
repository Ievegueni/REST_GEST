import { tenantFeatures } from '../../core/auth';
import { prisma, tenantDb } from '../../core/prisma';
import { defineJob } from '../../jobs/queue';
import { todayLocal } from '../reports/common';

/**
 * Gera os custos recorrentes devidos até `today` (uma vez por mês, idempotente).
 * O custo fica com a data do dia do mês configurado.
 */
export async function generateRecurring(tenantId: string, today = todayLocal()) {
  const db = tenantDb(tenantId);
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const due = await db.recurringCost.findMany({
    where: {
      active: true,
      dayOfMonth: { lte: day },
      OR: [{ lastGeneratedMonth: null }, { lastGeneratedMonth: { lt: month } }],
    },
  });
  for (const r of due) {
    await db.$transaction(async (tx) => {
      // condição repetida no update: dois jobs em paralelo não geram duas vezes
      const claimed = await tx.recurringCost.updateMany({
        where: {
          id: r.id,
          OR: [{ lastGeneratedMonth: null }, { lastGeneratedMonth: { lt: month } }],
        },
        data: { lastGeneratedMonth: month },
      });
      if (!claimed.count) return;
      await tx.dailyCost.create({
        data: {
          unitId: r.unitId,
          date: new Date(`${month}-${String(r.dayOfMonth).padStart(2, '0')}`),
          categoryId: r.categoryId,
          description: r.description,
          amount: r.amount,
          recurringCostId: r.id,
          createdById: 'system',
        },
      });
    });
  }
  return due.length;
}

export const recurringJob = defineJob<object>(
  'costs-recurring',
  async () => {
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    for (const t of tenants)
      if ((await tenantFeatures(t.id)).has('daily_costs')) await generateRecurring(t.id);
  },
  { inlineInTests: false, every: { pattern: '0 6 * * *' } },
);
