import type { Prisma } from '@prisma/client';
import { audit } from '../../core/audit';
import { assertUnitAccess, type AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { monthSummary } from '../hr/service';
import { computeLine, type Bracket, type PayParams } from './calc';

const pad = (n: number) => String(n).padStart(2, '0');
const monthRange = (year: number, month: number) => {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // último dia
  return { start, end, key: `${year}-${pad(month)}` };
};

/** Parâmetros do tenant: obrigatórios (sem valores por defeito no código). */
export async function payParams(tenantId: string): Promise<PayParams> {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (!t.payrollWeeklyHours || t.payrollOvertimeRate == null || !t.payrollMonthDays) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Configure os parâmetros de salários em Definições → Salários',
    );
  }
  return {
    weeklyHours: t.payrollWeeklyHours,
    overtimeRate: Number(t.payrollOvertimeRate),
    monthDays: t.payrollMonthDays,
  };
}

/** Tabela fiscal em vigor no primeiro dia do mês. */
export async function taxTableFor(date: Date) {
  const t = await prisma.taxTable.findFirst({
    where: { validFrom: { lte: date } },
    orderBy: { validFrom: 'desc' },
  });
  if (!t)
    throw new AppError(
      'VALIDATION_ERROR',
      'Não há tabela de IRT/INSS em vigor para este mês (Super Admin)',
    );
  return t;
}

const runInclude = {
  unit: { select: { id: true, name: true } },
  taxTable: { select: { validFrom: true } },
  lines: {
    include: {
      employee: {
        select: {
          id: true,
          number: true,
          name: true,
          nif: true,
          socialSecurityNo: true,
          position: { select: { name: true } },
        },
      },
    },
    orderBy: { employee: { name: 'asc' } },
  },
} as const;

export async function getRun(auth: AuthContext, id: string) {
  const r = await auth.db.payrollRun.findUniqueOrThrow({ where: { id }, include: runInclude });
  assertUnitAccess(auth, r.unitId);
  return r;
}

/** Processa (ou reprocessa, enquanto rascunho) os salários de uma unidade num mês. */
export async function processRun(auth: AuthContext, unitId: string, year: number, month: number) {
  assertUnitAccess(auth, unitId);
  const db = auth.db;
  const existing = await db.payrollRun.findFirst({ where: { unitId, year, month } });
  if (existing && existing.status !== 'DRAFT')
    throw new AppError('CONFLICT', 'Processamento já aprovado: não pode ser recalculado');

  const { start, end, key } = monthRange(year, month);
  const [params, table] = await Promise.all([payParams(auth.tenantId), taxTableFor(start)]);
  const tax = {
    inssEmployeeRate: Number(table.inssEmployeeRate),
    inssEmployerRate: Number(table.inssEmployerRate),
    brackets: table.irtBrackets as unknown as Bracket[],
  };
  const employees = await db.employee.findMany({
    where: {
      unitId,
      baseSalary: { not: null },
      hireDate: { lte: end },
      OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
    },
    include: {
      allowances: true,
      deductions: { where: { remaining: { gt: 0 }, date: { lte: end } }, orderBy: { date: 'asc' } },
    },
  });
  if (!employees.length)
    throw new AppError('VALIDATION_ERROR', 'Sem funcionários com salário base nesta unidade');
  const attendance = new Map(
    (await monthSummary(auth, unitId, key)).map((s) => [s.employee.id, s]),
  );

  const lines = employees.map((e) => {
    const from = e.hireDate > start ? e.hireDate : start;
    const to = e.terminationDate && e.terminationDate < end ? e.terminationDate : end;
    const daysInMonth = end.getUTCDate();
    const employedDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const paidDays =
      employedDays >= daysInMonth ? params.monthDays : Math.min(params.monthDays, employedDays);
    const a = attendance.get(e.id);
    const r = computeLine(
      {
        baseSalary: e.baseSalary!,
        paidDays,
        allowances: e.allowances.map((x) => ({
          name: x.name,
          amount: x.amount,
          inssSubject: x.inssSubject,
          irtExemptUpTo: x.irtExemptUpTo,
        })),
        overtimeHours: a?.overtimeHours ?? 0,
        unjustifiedDays: a?.unjustified ?? 0,
        deductions: e.deductions.map((d) => ({
          id: d.id,
          description: d.description,
          installmentAmount: d.installmentAmount,
          remaining: d.remaining,
        })),
      },
      params,
      tax,
    );
    const { applied, ...amounts } = r;
    return {
      employeeId: e.id,
      ...amounts,
      details: {
        paidDays,
        overtimeHours: a?.overtimeHours ?? 0,
        unjustifiedDays: a?.unjustified ?? 0,
        allowances: e.allowances.map((x) => ({ name: x.name, amount: x.amount })),
        deductions: applied,
      } as Prisma.InputJsonObject,
    };
  });
  const totals = {
    totalGross: lines.reduce((s, l) => s + l.gross, 0),
    totalNet: lines.reduce((s, l) => s + l.net, 0),
    totalCost: lines.reduce((s, l) => s + l.gross + l.inssEmployer, 0),
  };

  const id = await db.$transaction(async (tx) => {
    const run = existing
      ? await tx.payrollRun.update({
          where: { id: existing.id },
          data: { taxTableId: table.id, params, ...totals },
        })
      : await tx.payrollRun.create({
          data: {
            unitId,
            year,
            month,
            taxTableId: table.id,
            params,
            createdById: auth.userId,
            ...totals,
          },
        });
    await tx.payrollLine.deleteMany({ where: { runId: run.id } });
    await tx.payrollLine.createMany({ data: lines.map((l) => ({ ...l, runId: run.id })) });
    return run.id;
  });
  return getRun(auth, id);
}

/** Aprova: bloqueia o processamento e abate as prestações dos descontos aplicados. */
export async function approveRun(auth: AuthContext, id: string, ip?: string) {
  const run = await getRun(auth, id);
  if (run.status !== 'DRAFT')
    throw new AppError('VALIDATION_ERROR', 'Só rascunhos podem ser aprovados');
  await auth.db.$transaction(async (tx) => {
    for (const l of run.lines) {
      for (const d of (l.details as { deductions: { id: string; amount: number }[] }).deductions) {
        await tx.employeeDeduction.update({
          where: { id: d.id },
          data: { remaining: { decrement: d.amount } },
        });
      }
    }
    await tx.payrollRun.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: auth.userId, approvedAt: new Date() },
    });
  });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'payroll.approve',
    entity: 'PayrollRun',
    entityId: id,
    after: { totalNet: run.totalNet },
    ip,
  });
  return getRun(auth, id);
}

export async function markPaid(auth: AuthContext, id: string, ip?: string) {
  const run = await getRun(auth, id);
  if (run.status !== 'APPROVED')
    throw new AppError('VALIDATION_ERROR', 'Só processamentos aprovados podem ser pagos');
  await auth.db.payrollRun.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'payroll.pay',
    entity: 'PayrollRun',
    entityId: id,
    ip,
  });
  return getRun(auth, id);
}

export async function deleteDraft(auth: AuthContext, id: string) {
  const run = await getRun(auth, id);
  if (run.status !== 'DRAFT')
    throw new AppError('VALIDATION_ERROR', 'Só rascunhos podem ser apagados');
  await auth.db.payrollRun.delete({ where: { id } });
}
