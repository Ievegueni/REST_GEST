import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { decrypt, encrypt } from '../../core/crypto';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';
import { workingDays } from './service';

describe('utilitários', () => {
  it('encripta/decifra e detecta adulteração', () => {
    const c = encrypt('AO06004000001234567890123');
    expect(c).not.toContain('1234567890');
    expect(decrypt(c)).toBe('AO06004000001234567890123');
    const parts = c.split(':');
    parts[3] = Buffer.from('xxxx').toString('base64');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });
  it('conta dias úteis', () => {
    expect(workingDays('2026-11-02', '2026-11-08')).toBe(5); // seg a dom
    expect(workingDays('2026-11-07', '2026-11-08')).toBe(0);
  });
});

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let rh: Awaited<ReturnType<typeof clientFor>>; // hr.sensitive
let manager: Awaited<ReturnType<typeof clientFor>>; // hr.view + hr.manage, sem sensíveis
let other: Awaited<ReturnType<typeof clientFor>>; // só unidade B
let unitB = '';
let empId = '';
const IBAN = 'AO06 0040 0000 1234 5678 9012 3';

beforeAll(async () => {
  T = await createTestTenant({ name: 'HR', plan: 'COMPLETO', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  unitB = (await db.unit.create({ data: { name: 'B' } })).id;
  const mgrRole = await db.role.create({
    data: {
      name: 'Gerente teste',
      permissions: { connect: ['hr.view', 'hr.manage'].map((code) => ({ code })) },
    },
  });
  const hash = await argon2.hash('password123');
  const user = async (email: string, unitId: string) => {
    const u = await db.user.create({
      data: {
        name: email,
        email: `${email}-${T.tenant.id}@test.local`,
        passwordHash: hash,
        roleId: mgrRole.id,
      },
    });
    await db.userUnit.create({ data: { userId: u.id, unitId } });
    return u.email;
  };
  rh = await clientFor(app, T.email);
  manager = await clientFor(app, await user('mgr', T.unit.id));
  other = await clientFor(app, await user('oth', unitB));
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

const employee = (over: object = {}) => ({
  number: 'F001',
  name: 'Maria Silva',
  unitId: T.unit.id,
  hireDate: '2025-01-15',
  vacationDaysPerYear: 22,
  ...over,
});

describe('funcionários e dados sensíveis', () => {
  it('plano STOCK não tem RH', async () => {
    const s = await createTestTenant({ name: 'HRstock', plan: 'STOCK', perms: [...PERMISSIONS] });
    const api = await clientFor(app, s.email);
    const res = await api('GET', '/api/employees');
    expect(res.json().error.code).toBe('FEATURE_NOT_IN_PLAN');
    await deleteTenants([s.tenant.id]);
  });

  it('RH cria com salário, subsídios e IBAN cifrado na BD', async () => {
    const res = await rh('POST', '/api/employees', {
      ...employee(),
      sensitive: {
        baseSalary: 150000,
        iban: IBAN,
        bankName: 'BAI',
        allowances: [{ name: 'Transporte', amount: 10000 }],
      },
    });
    expect(res.statusCode).toBe(201);
    const e = res.json().data;
    empId = e.id;
    expect(e).toMatchObject({
      baseSalary: 150000,
      iban: 'AO06004000001234567890123',
      allowances: [{ name: 'Transporte', amount: 10000 }],
    });
    const row = await db.employee.findUniqueOrThrow({ where: { id: empId } });
    expect(row.ibanEncrypted).not.toContain('1234567890');
  });

  it('auditoria regista os campos alterados, nunca os valores', async () => {
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: 'employee.sensitive.create', entityId: empId },
    });
    const json = JSON.stringify(log);
    expect(json).toContain('baseSalary');
    expect(json).not.toContain('150000');
    expect(json).not.toContain('1234567890');
  });

  it('sem hr.sensitive não vê nem altera dados sensíveis', async () => {
    const e = (await manager('GET', `/api/employees/${empId}`)).json().data;
    expect(e.name).toBe('Maria Silva');
    for (const k of ['baseSalary', 'iban', 'ibanEncrypted', 'allowances', 'documents', 'nif'])
      expect(e[k]).toBeUndefined();
    const list = (await manager('GET', '/api/employees')).json().data;
    expect(list[0].baseSalary).toBeUndefined();
    const res = await manager('PUT', `/api/employees/${empId}`, {
      ...employee(),
      sensitive: { baseSalary: 1 },
    });
    expect(res.statusCode).toBe(403);
    expect(
      (await manager('POST', `/api/employees/${empId}/documents`, { name: 'BI', url: '/x' }))
        .statusCode,
    ).toBe(403);
    // gravar campos gerais não apaga os sensíveis
    expect(
      (await manager('PUT', `/api/employees/${empId}`, employee({ phone: '923111222' })))
        .statusCode,
    ).toBe(200);
    expect((await rh('GET', `/api/employees/${empId}`)).json().data.baseSalary).toBe(150000);
  });

  it('isolamento por unidade', async () => {
    expect((await other('GET', `/api/employees/${empId}`)).statusCode).toBe(403);
    expect((await other('GET', '/api/employees')).json().data).toEqual([]);
  });
});

describe('escalas, presenças e licenças', () => {
  it('escala semanal', async () => {
    const res = await manager('PUT', '/api/shifts', {
      unitId: T.unit.id,
      weekStart: '2026-11-02',
      shifts: [{ employeeId: empId, date: '2026-11-03', start: '08:00', end: '16:00' }],
    });
    expect(res.json().data.shifts).toMatchObject([{ date: '2026-11-03', start: '08:00' }]);
    const bad = await manager('PUT', '/api/shifts', {
      unitId: T.unit.id,
      weekStart: '2026-11-02',
      shifts: [{ employeeId: empId, date: '2026-11-10', start: '08:00', end: '16:00' }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('férias: sobreposição, saldo e aprovação', async () => {
    const a = (
      await manager('POST', '/api/leaves', {
        employeeId: empId,
        type: 'VACATION',
        startDate: '2026-11-09',
        endDate: '2026-11-20',
      })
    ).json().data;
    expect(a.days).toBe(10);
    expect(
      (
        await manager('POST', '/api/leaves', {
          employeeId: empId,
          type: 'SICK',
          startDate: '2026-11-20',
          endDate: '2026-11-21',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await manager('POST', `/api/leaves/${a.id}/decide`, { decision: 'APPROVED' })).json().data
        .status,
    ).toBe('APPROVED');
    const big = (
      await manager('POST', '/api/leaves', {
        employeeId: empId,
        type: 'VACATION',
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      })
    ).json().data;
    const res = await manager('POST', `/api/leaves/${big.id}/decide`, { decision: 'APPROVED' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('12 dias disponíveis');
    const bal = (await manager('GET', `/api/employees/${empId}/vacation-balance?year=2026`)).json()
      .data;
    expect(bal).toMatchObject({ entitlement: 22, used: 10, pending: 23, available: 12 });
  });

  it('presenças do dia e resumo mensal', async () => {
    const sheet = (
      await manager('GET', `/api/attendance?unitId=${T.unit.id}&date=2026-11-03`)
    ).json().data;
    expect(sheet[0].shift).toMatchObject({ start: '08:00' });
    await manager('PUT', `/api/attendance?unitId=${T.unit.id}`, {
      date: '2026-11-03',
      records: [{ employeeId: empId, status: 'PRESENT', overtimeMinutes: 90 }],
    });
    await manager('PUT', `/api/attendance?unitId=${T.unit.id}`, {
      date: '2026-11-04',
      records: [{ employeeId: empId, status: 'ABSENT_UNJUSTIFIED' }],
    });
    const [s] = (
      await manager('GET', `/api/attendance/summary?unitId=${T.unit.id}&month=2026-11`)
    ).json().data;
    expect(s).toMatchObject({ present: 1, unjustified: 1, overtimeHours: 1.5, leaveDays: 10 });
    expect(
      (
        await other('PUT', `/api/attendance?unitId=${unitB}`, {
          date: '2026-11-03',
          records: [{ employeeId: empId, status: 'PRESENT' }],
        })
      ).statusCode,
    ).toBe(400);
  });
});
