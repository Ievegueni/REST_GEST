import type { Employee, EmployeeAllowance, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { audit } from '../../core/audit';
import { assertUnitAccess, canAccessUnit, type AuthContext } from '../../core/auth';
import { decrypt, encrypt } from '../../core/crypto';
import { AppError } from '../../core/errors';
import type {
  attendanceSchema,
  employeeSchema,
  leaveSchema,
  sensitiveSchema,
  shiftsSchema,
} from './schemas';

const SENSITIVE_FIELDS = [
  'baseSalary',
  'nif',
  'idNumber',
  'socialSecurityNo',
  'bankName',
  'ibanEncrypted',
] as const;

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(day(d).getTime() + n * 86_400_000));

/** Dias úteis (seg–sex) entre duas datas inclusivas. ponytail: sem feriados; tabela de feriados quando os salários o exigirem. */
export function workingDays(start: string, end: string) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = day(d).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** Remove os campos sensíveis, ou decifra o IBAN para quem tem hr.sensitive. */
export function present(auth: AuthContext, e: Employee & { allowances?: EmployeeAllowance[] }) {
  const { ibanEncrypted, allowances, ...rest } = e;
  if (!auth.permissions.has('hr.sensitive')) {
    for (const f of SENSITIVE_FIELDS) delete (rest as Record<string, unknown>)[f];
    return rest;
  }
  return {
    ...rest,
    iban: ibanEncrypted ? decrypt(ibanEncrypted) : null,
    allowances: allowances ?? [],
  };
}

async function loadEmployee(auth: AuthContext, id: string) {
  const e = await auth.db.employee.findUniqueOrThrow({
    where: { id },
    include: { allowances: true },
  });
  assertUnitAccess(auth, e.unitId);
  return e;
}

export async function getEmployee(auth: AuthContext, id: string) {
  const e = await loadEmployee(auth, id);
  return {
    ...present(auth, e),
    documents: auth.permissions.has('hr.sensitive')
      ? await auth.db.employeeDocument.findMany({
          where: { employeeId: id },
          orderBy: { uploadedAt: 'desc' },
        })
      : undefined,
  };
}

export async function listEmployees(auth: AuthContext, q: { unitId?: string; active?: string }) {
  if (q.unitId) assertUnitAccess(auth, q.unitId);
  const rows = await auth.db.employee.findMany({
    where: {
      ...(q.unitId && { unitId: q.unitId }),
      ...(q.active && { active: q.active === 'true' }),
    },
    include: {
      allowances: true,
      position: { select: { name: true } },
      unit: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });
  return rows
    .filter((e) => canAccessUnit(auth, e.unitId))
    .map((e) => ({ ...present(auth, e), position: e.position, unit: e.unit }));
}

/** Cria/actualiza. Os campos sensíveis só são aceites com hr.sensitive e auditados sem valores. */
export async function saveEmployee(
  auth: AuthContext,
  id: string | null,
  general: z.infer<typeof employeeSchema>,
  sensitive: z.infer<typeof sensitiveSchema> | null,
  ip?: string,
) {
  assertUnitAccess(auth, general.unitId);
  if (sensitive && !auth.permissions.has('hr.sensitive')) {
    throw new AppError('FORBIDDEN', 'Sem permissão para dados sensíveis', {
      permission: 'hr.sensitive',
    });
  }
  const before = id ? await loadEmployee(auth, id) : null;
  const data: Prisma.EmployeeUncheckedUpdateInput = { ...general };
  if (sensitive) {
    const { iban, allowances, ...plain } = sensitive;
    Object.assign(data, plain);
    if (iban !== undefined) data.ibanEncrypted = iban ? encrypt(iban) : null;
  }

  const saved = await auth.db.$transaction(async (tx) => {
    const e = id
      ? await tx.employee.update({ where: { id }, data })
      : await tx.employee.create({ data: data as Prisma.EmployeeUncheckedCreateInput });
    if (sensitive?.allowances) {
      await tx.employeeAllowance.deleteMany({ where: { employeeId: e.id } });
      await tx.employeeAllowance.createMany({
        data: sensitive.allowances.map((a) => ({ ...a, employeeId: e.id })),
      });
    }
    return e;
  });

  if (sensitive) {
    const changed = SENSITIVE_FIELDS.filter((f) => before?.[f] !== saved[f]);
    if (sensitive.allowances) changed.push('allowances' as never);
    if (changed.length) {
      await audit({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: id ? 'employee.sensitive.update' : 'employee.sensitive.create',
        entity: 'Employee',
        entityId: saved.id,
        after: { fields: changed }, // só os nomes dos campos — nunca os valores
        ip,
      });
    }
  }
  return getEmployee(auth, saved.id);
}

// ---------- Escalas ----------

export async function getWeek(auth: AuthContext, unitId: string, weekStart: string) {
  assertUnitAccess(auth, unitId);
  const end = addDays(weekStart, 7);
  const employees = await auth.db.employee.findMany({
    where: { unitId, active: true },
    select: { id: true, number: true, name: true, position: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  const shifts = await auth.db.shift.findMany({
    where: {
      employeeId: { in: employees.map((e) => e.id) },
      date: { gte: day(weekStart), lt: day(end) },
    },
  });
  return { employees, shifts: shifts.map((s) => ({ ...s, date: iso(s.date) })) };
}

/** Substitui a escala da semana dos funcionários da unidade. */
export async function saveWeek(auth: AuthContext, input: z.infer<typeof shiftsSchema>) {
  assertUnitAccess(auth, input.unitId);
  const end = addDays(input.weekStart, 7);
  const ids = new Set(
    (
      await auth.db.employee.findMany({ where: { unitId: input.unitId }, select: { id: true } })
    ).map((e) => e.id),
  );
  for (const s of input.shifts) {
    if (!ids.has(s.employeeId))
      throw new AppError('VALIDATION_ERROR', 'Funcionário de outra unidade');
    if (s.date < input.weekStart || s.date >= end)
      throw new AppError('VALIDATION_ERROR', 'Turno fora da semana');
  }
  await auth.db.$transaction(async (tx) => {
    await tx.shift.deleteMany({
      where: { employeeId: { in: [...ids] }, date: { gte: day(input.weekStart), lt: day(end) } },
    });
    await tx.shift.createMany({ data: input.shifts.map((s) => ({ ...s, date: day(s.date) })) });
  });
  return getWeek(auth, input.unitId, input.weekStart);
}

// ---------- Presenças ----------

/** Folha do dia: funcionários activos com presença, turno e licença aprovada (se houver). */
export async function getDay(auth: AuthContext, unitId: string, date: string) {
  assertUnitAccess(auth, unitId);
  const d = day(date);
  const employees = await auth.db.employee.findMany({
    where: {
      unitId,
      active: true,
      hireDate: { lte: d },
      OR: [{ terminationDate: null }, { terminationDate: { gte: d } }],
    },
    select: { id: true, number: true, name: true },
    orderBy: { name: 'asc' },
  });
  const ids = employees.map((e) => e.id);
  const [att, shifts, leaves] = await Promise.all([
    auth.db.attendance.findMany({ where: { employeeId: { in: ids }, date: d } }),
    auth.db.shift.findMany({ where: { employeeId: { in: ids }, date: d } }),
    auth.db.leave.findMany({
      where: {
        employeeId: { in: ids },
        status: 'APPROVED',
        startDate: { lte: d },
        endDate: { gte: d },
      },
    }),
  ]);
  return employees.map((e) => ({
    employee: e,
    attendance: att.find((a) => a.employeeId === e.id) ?? null,
    shift: shifts.find((s) => s.employeeId === e.id) ?? null,
    leave: leaves.find((l) => l.employeeId === e.id) ?? null,
  }));
}

export async function saveDay(
  auth: AuthContext,
  unitId: string,
  input: z.infer<typeof attendanceSchema>,
) {
  assertUnitAccess(auth, unitId);
  const ids = new Set(
    (await auth.db.employee.findMany({ where: { unitId }, select: { id: true } })).map((e) => e.id),
  );
  const d = day(input.date);
  await auth.db.$transaction(async (tx) => {
    for (const r of input.records) {
      if (!ids.has(r.employeeId))
        throw new AppError('VALIDATION_ERROR', 'Funcionário de outra unidade');
      const data = { ...r, recordedById: auth.userId };
      await tx.attendance.upsert({
        where: { employeeId_date: { employeeId: r.employeeId, date: d } },
        create: { ...data, date: d },
        update: data,
      });
    }
  });
  return getDay(auth, unitId, input.date);
}

/** Resumo mensal por funcionário (base para os salários). */
export async function monthSummary(auth: AuthContext, unitId: string, month: string) {
  assertUnitAccess(auth, unitId);
  const start = `${month}-01`;
  const next = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)));
  const last = addDays(next, -1);
  const employees = await auth.db.employee.findMany({
    where: { unitId },
    select: { id: true, number: true, name: true },
    orderBy: { name: 'asc' },
  });
  const ids = employees.map((e) => e.id);
  const [att, leaves] = await Promise.all([
    auth.db.attendance.findMany({
      where: { employeeId: { in: ids }, date: { gte: day(start), lt: day(next) } },
    }),
    auth.db.leave.findMany({
      where: {
        employeeId: { in: ids },
        status: 'APPROVED',
        startDate: { lte: day(last) },
        endDate: { gte: day(start) },
      },
    }),
  ]);
  return employees.map((e) => {
    const mine = att.filter((a) => a.employeeId === e.id);
    const count = (s: string) => mine.filter((a) => a.status === s).length;
    const leaveDays = leaves
      .filter((l) => l.employeeId === e.id)
      .reduce((s, l) => {
        const from = iso(l.startDate) < start ? start : iso(l.startDate);
        const to = iso(l.endDate) > last ? last : iso(l.endDate);
        return s + workingDays(from, to);
      }, 0);
    return {
      employee: e,
      present: count('PRESENT'),
      justified: count('ABSENT_JUSTIFIED'),
      unjustified: count('ABSENT_UNJUSTIFIED'),
      dayOff: count('DAY_OFF'),
      leaveDays,
      overtimeHours: Math.round((mine.reduce((s, a) => s + a.overtimeMinutes, 0) / 60) * 100) / 100,
    };
  });
}

// ---------- Férias e licenças ----------

export async function vacationBalance(auth: AuthContext, employeeId: string, year: number) {
  const e = await loadEmployee(auth, employeeId);
  const leaves = await auth.db.leave.findMany({
    where: {
      employeeId,
      type: 'VACATION',
      status: { in: ['APPROVED', 'REQUESTED'] },
      startDate: { gte: day(`${year}-01-01`), lte: day(`${year}-12-31`) },
    },
  });
  const used = leaves.filter((l) => l.status === 'APPROVED').reduce((s, l) => s + l.days, 0);
  const pending = leaves.filter((l) => l.status === 'REQUESTED').reduce((s, l) => s + l.days, 0);
  return {
    year,
    entitlement: e.vacationDaysPerYear,
    used,
    pending,
    available: e.vacationDaysPerYear == null ? null : e.vacationDaysPerYear - used,
  };
}

export async function requestLeave(auth: AuthContext, input: z.infer<typeof leaveSchema>) {
  await loadEmployee(auth, input.employeeId);
  const overlap = await auth.db.leave.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { in: ['REQUESTED', 'APPROVED'] },
      startDate: { lte: day(input.endDate) },
      endDate: { gte: day(input.startDate) },
    },
  });
  if (overlap) throw new AppError('CONFLICT', 'Sobrepõe-se a outra licença do funcionário');
  const days = workingDays(input.startDate, input.endDate);
  if (!days) throw new AppError('VALIDATION_ERROR', 'O período não tem dias úteis');
  return auth.db.leave.create({
    data: {
      ...input,
      startDate: day(input.startDate),
      endDate: day(input.endDate),
      days,
      requestedById: auth.userId,
    },
  });
}

export async function decideLeave(
  auth: AuthContext,
  id: string,
  decision: 'APPROVED' | 'REJECTED' | 'CANCELLED',
) {
  const l = await auth.db.leave.findUniqueOrThrow({ where: { id } });
  await loadEmployee(auth, l.employeeId);
  const allowed = decision === 'CANCELLED' ? ['REQUESTED', 'APPROVED'] : ['REQUESTED'];
  if (!allowed.includes(l.status))
    throw new AppError('VALIDATION_ERROR', 'Estado da licença não permite esta decisão');
  if (decision === 'APPROVED' && l.type === 'VACATION') {
    const b = await vacationBalance(auth, l.employeeId, l.startDate.getUTCFullYear());
    if (b.available != null && l.days > b.available) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Saldo de férias insuficiente (${b.available} dias disponíveis)`,
      );
    }
  }
  return auth.db.leave.update({
    where: { id },
    data: { status: decision, decidedById: auth.userId, decidedAt: new Date() },
  });
}
