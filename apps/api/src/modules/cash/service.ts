import type { z } from 'zod';
import { audit } from '../../core/audit';
import { assertUnitAccess, type AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { raise } from '../alerts/engine';
import type { amountsSchema, movementSchema, openSchema } from './schemas';

async function load(auth: AuthContext, id: string) {
  const s = await auth.db.cashSession.findUniqueOrThrow({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
      amounts: true,
      movements: { orderBy: { createdAt: 'asc' } },
    },
  });
  assertUnitAccess(auth, s.unitId);
  return s;
}

const assertOpen = (s: { status: string }) => {
  if (s.status !== 'OPEN') throw new AppError('VALIDATION_ERROR', 'Sessão de caixa fechada');
};

/**
 * Resumo: por meio de pagamento, sistema vs contado. Numerário esperado =
 * fundo + vendas em numerário + entradas − sangrias − pagamentos pela caixa.
 */
export async function getSession(auth: AuthContext, id: string) {
  const s = await load(auth, id);
  const methods = await auth.db.paymentMethod.findMany({
    where: { OR: [{ active: true }, { id: { in: s.amounts.map((a) => a.paymentMethodId) } }] },
    orderBy: { name: 'asc' },
  });
  const mv = (type: string) =>
    s.movements.filter((m) => m.type === type).reduce((x, m) => x + m.amount, 0);
  const [deposits, withdrawals, expenses] = [mv('DEPOSIT'), mv('WITHDRAWAL'), mv('EXPENSE')];
  const lines = methods.map((m) => {
    const a = s.amounts.find((x) => x.paymentMethodId === m.id);
    const system = a?.systemAmount ?? 0;
    const counted = a?.countedAmount ?? null;
    // numerário: a diferença é calculada no total (fundo, sangrias, pagamentos); restantes: contado − sistema
    return {
      paymentMethod: m,
      systemAmount: system,
      countedAmount: counted,
      difference: m.isCash || counted == null ? null : counted - system,
    };
  });
  const cash = lines.filter((l) => l.paymentMethod.isCash);
  const expectedCash =
    s.openingFloat +
    cash.reduce((x, l) => x + l.systemAmount, 0) +
    deposits -
    withdrawals -
    expenses;
  const countedCash = cash.every((l) => l.countedAmount == null)
    ? null
    : cash.reduce((x, l) => x + (l.countedAmount ?? 0), 0);
  const nonCashDiff = lines
    .filter((l) => !l.paymentMethod.isCash)
    .reduce((x, l) => x + (l.difference ?? 0), 0);
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: auth.tenantId },
    select: { cashDifferenceLimit: true },
  });
  return {
    ...s,
    lines,
    summary: {
      deposits,
      withdrawals,
      expenses,
      expectedCash,
      countedCash,
      cashDifference: countedCash == null ? null : countedCash - expectedCash,
      totalDifference: (countedCash == null ? 0 : countedCash - expectedCash) + nonCashDiff,
      limit: tenant.cashDifferenceLimit,
    },
  };
}

export async function openSession(auth: AuthContext, input: z.infer<typeof openSchema>) {
  assertUnitAccess(auth, input.unitId);
  const s = await auth.db.cashSession.create({ data: { ...input, openedById: auth.userId } });
  return getSession(auth, s.id);
}

export async function setAmounts(
  auth: AuthContext,
  id: string,
  input: z.infer<typeof amountsSchema>,
) {
  assertOpen(await load(auth, id));
  await auth.db.$transaction(async (tx) => {
    for (const a of input.amounts) {
      const data = {
        ...(a.systemAmount !== undefined && { systemAmount: a.systemAmount }),
        ...(a.countedAmount !== undefined && { countedAmount: a.countedAmount }),
      };
      await tx.cashSessionAmount.upsert({
        where: { sessionId_paymentMethodId: { sessionId: id, paymentMethodId: a.paymentMethodId } },
        create: { sessionId: id, paymentMethodId: a.paymentMethodId, ...data },
        update: data,
      });
    }
    if (input.denominations !== undefined)
      await tx.cashSession.update({
        where: { id },
        data: { denominations: input.denominations ?? undefined },
      });
  });
  return getSession(auth, id);
}

/** Sangria, entrada ou pagamento pela caixa (este gera um custo diário ligado à sessão). */
export async function addMovement(
  auth: AuthContext,
  id: string,
  input: z.infer<typeof movementSchema>,
) {
  const s = await load(auth, id);
  assertOpen(s);
  await auth.db.$transaction(async (tx) => {
    let dailyCostId: string | null = null;
    if (input.type === 'EXPENSE') {
      if (!input.categoryId)
        throw new AppError('VALIDATION_ERROR', 'Categoria de custo obrigatória no pagamento');
      const cashMethod = await tx.paymentMethod.findFirst({
        where: { isCash: true, active: true },
      });
      dailyCostId = (
        await tx.dailyCost.create({
          data: {
            unitId: s.unitId,
            date: s.businessDate,
            categoryId: input.categoryId,
            description: input.description,
            amount: input.amount,
            paymentMethodId: cashMethod?.id ?? null,
            cashSessionId: id,
            createdById: auth.userId,
          },
        })
      ).id;
    }
    await tx.cashMovement.create({
      data: {
        sessionId: id,
        type: input.type,
        amount: input.amount,
        description: input.description,
        dailyCostId,
        createdById: auth.userId,
      },
    });
  });
  return getSession(auth, id);
}

export async function deleteMovement(auth: AuthContext, id: string, movementId: string) {
  assertOpen(await load(auth, id));
  await auth.db.$transaction(async (tx) => {
    const m = await tx.cashMovement.findFirstOrThrow({ where: { id: movementId, sessionId: id } });
    await tx.cashMovement.delete({ where: { id: m.id } });
    if (m.dailyCostId) await tx.dailyCost.delete({ where: { id: m.dailyCostId } });
  });
  return getSession(auth, id);
}

/** Fecha: exige contagem; acima do limite a justificação é obrigatória e é aberto um alerta. */
export async function closeSession(
  auth: AuthContext,
  id: string,
  justification: string | null,
  ip?: string,
) {
  const s = await getSession(auth, id);
  assertOpen(s);
  const missing = s.lines.filter(
    (l) => l.countedAmount == null && (l.paymentMethod.isCash || l.systemAmount > 0),
  );
  if (missing.length)
    throw new AppError(
      'VALIDATION_ERROR',
      `Falta o valor contado: ${missing.map((l) => l.paymentMethod.name).join(', ')}`,
    );
  const diff = s.summary.totalDifference;
  const over = s.summary.limit != null && Math.abs(diff) > s.summary.limit;
  if (over && !justification)
    throw new AppError('VALIDATION_ERROR', 'Diferença acima do limite: justificação obrigatória');

  await auth.db.cashSession.update({
    where: { id },
    data: {
      status: 'CLOSED',
      difference: diff,
      justification,
      closedById: auth.userId,
      closedAt: new Date(),
    },
  });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'cash.close',
    entity: 'CashSession',
    entityId: id,
    after: { difference: diff },
    ip,
  });
  if (over && auth.features.has('alerts_sms')) {
    const date = s.businessDate.toISOString().slice(0, 10).split('-').reverse().join('/');
    await raise(auth.db, auth.tenantId, {
      type: 'CASH_DIFFERENCE',
      key: `CASH_DIFFERENCE|${id}`,
      unitId: s.unitId,
      message: `Diferença de caixa de ${new Intl.NumberFormat('pt-AO').format(diff)} Kz em ${s.unit.name} (${date}${s.shift ? ` · ${s.shift}` : ''}): ${justification}`,
    });
  }
  return getSession(auth, id);
}

export async function reopenSession(auth: AuthContext, id: string, ip?: string) {
  const s = await load(auth, id);
  if (s.status !== 'CLOSED')
    throw new AppError(
      'VALIDATION_ERROR',
      'Só sessões fechadas (não validadas) podem ser reabertas',
    );
  await auth.db.cashSession.update({
    where: { id },
    data: { status: 'OPEN', closedAt: null, closedById: null, difference: null },
  });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'cash.reopen',
    entity: 'CashSession',
    entityId: id,
    ip,
  });
  return getSession(auth, id);
}

/** Validação pelo gerente: o fecho fica imutável. */
export async function validateSession(auth: AuthContext, id: string, ip?: string) {
  const s = await load(auth, id);
  if (s.status !== 'CLOSED')
    throw new AppError('VALIDATION_ERROR', 'Só sessões fechadas podem ser validadas');
  await auth.db.cashSession.update({
    where: { id },
    data: { status: 'VALIDATED', validatedById: auth.userId, validatedAt: new Date() },
  });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'cash.validate',
    entity: 'CashSession',
    entityId: id,
    after: { difference: s.difference },
    ip,
  });
  return getSession(auth, id);
}
