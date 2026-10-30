import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../core/audit';
import { assertUnitAccess, type AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import { money, optText } from '../../core/schemas';
import type { Tx } from '../stock/engine';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((v) => new Date(v));

export const payableSchema = z.object({
  supplierId: z.string().min(1),
  unitId: z.string().min(1),
  documentNumber: optText(50),
  description: optText(300),
  issueDate: day,
  dueDate: day.optional(),
  amount: money.refine((v) => v > 0, 'Valor obrigatório'),
});

export const paymentSchema = z.object({
  date: day,
  amount: money.refine((v) => v > 0, 'Valor obrigatório'),
  paymentMethodId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  reference: optText(100),
  attachmentUrl: z
    .string()
    .max(500)
    .nullish()
    .transform((v) => v || null),
  attachmentName: optText(200),
});

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Conta a pagar gerada por uma recepção (plano com a funcionalidade "payables"). */
export async function createFromReceipt(
  tx: Tx,
  r: {
    id: string;
    supplierId: string;
    unitId: string;
    invoiceNumber: string | null;
    invoiceDate: Date | null;
    receivedAt: Date;
    totalAmount: number;
    createdById: string;
  },
) {
  const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: r.supplierId } });
  const issue = r.invoiceDate ?? new Date(r.receivedAt.toISOString().slice(0, 10));
  await tx.payable.create({
    data: {
      supplierId: r.supplierId,
      unitId: r.unitId,
      receiptId: r.id,
      documentNumber: r.invoiceNumber,
      issueDate: issue,
      dueDate: addDays(issue, supplier.paymentTermDays),
      amount: r.totalAmount,
      createdById: r.createdById,
    },
  });
}

/** Anulação da recepção: cancela a conta, desde que não tenha pagamentos. */
export async function cancelForReceipt(tx: Tx, receiptId: string) {
  const p = await tx.payable.findFirst({ where: { receiptId } });
  if (!p) return;
  if (p.paidAmount > 0)
    throw new AppError(
      'VALIDATION_ERROR',
      'A conta a pagar desta recepção já tem pagamentos: anule-os primeiro',
    );
  await tx.payable.update({ where: { id: p.id }, data: { status: 'CANCELLED' } });
}

const include = {
  supplier: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true } },
  receipt: { select: { id: true, number: true } },
  payments: { orderBy: { date: 'asc' }, include: { paymentMethod: { select: { name: true } } } },
} as const satisfies Prisma.PayableInclude;

export async function getPayable(auth: AuthContext, id: string) {
  const p = await auth.db.payable.findUniqueOrThrow({ where: { id }, include });
  assertUnitAccess(auth, p.unitId);
  return p;
}

export async function createManual(auth: AuthContext, input: z.infer<typeof payableSchema>) {
  assertUnitAccess(auth, input.unitId);
  const supplier = await auth.db.supplier.findUniqueOrThrow({ where: { id: input.supplierId } });
  const p = await auth.db.payable.create({
    data: {
      ...input,
      dueDate: input.dueDate ?? addDays(input.issueDate, supplier.paymentTermDays),
      createdById: auth.userId,
    },
  });
  return getPayable(auth, p.id);
}

const statusFor = (amount: number, paid: number) =>
  paid >= amount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'OPEN';

export async function addPayment(
  auth: AuthContext,
  id: string,
  input: z.infer<typeof paymentSchema>,
  ip?: string,
) {
  const p = await getPayable(auth, id);
  if (p.status === 'CANCELLED' || p.status === 'PAID')
    throw new AppError('VALIDATION_ERROR', 'Conta já paga ou cancelada');
  if (input.amount > p.amount - p.paidAmount)
    throw new AppError(
      'VALIDATION_ERROR',
      `Valor acima do saldo em dívida (${p.amount - p.paidAmount} Kz)`,
    );
  await auth.db.$transaction(async (tx) => {
    await tx.payablePayment.create({ data: { ...input, payableId: id, createdById: auth.userId } });
    const paid = p.paidAmount + input.amount;
    await tx.payable.update({
      where: { id },
      data: { paidAmount: paid, status: statusFor(p.amount, paid) },
    });
  });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'payable.payment',
    entity: 'Payable',
    entityId: id,
    after: { amount: input.amount },
    ip,
  });
  return getPayable(auth, id);
}

export async function deletePayment(auth: AuthContext, id: string, paymentId: string, ip?: string) {
  const p = await getPayable(auth, id);
  const pay = p.payments.find((x) => x.id === paymentId);
  if (!pay) throw new AppError('NOT_FOUND', 'Pagamento não encontrado');
  await auth.db.$transaction(async (tx) => {
    await tx.payablePayment.delete({ where: { id: paymentId } });
    const paid = p.paidAmount - pay.amount;
    await tx.payable.update({
      where: { id },
      data: {
        paidAmount: paid,
        status: p.status === 'CANCELLED' ? 'CANCELLED' : statusFor(p.amount, paid),
      },
    });
  });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'payable.payment.delete',
    entity: 'Payable',
    entityId: id,
    before: { amount: pay.amount },
    ip,
  });
  return getPayable(auth, id);
}

export async function cancelManual(auth: AuthContext, id: string) {
  const p = await getPayable(auth, id);
  if (p.receiptId)
    throw new AppError('VALIDATION_ERROR', 'Conta de uma recepção: anule a recepção');
  if (p.paidAmount > 0) throw new AppError('VALIDATION_ERROR', 'A conta tem pagamentos');
  await auth.db.payable.update({ where: { id }, data: { status: 'CANCELLED' } });
  return getPayable(auth, id);
}
