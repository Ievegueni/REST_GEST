import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import ExcelJS from 'exceljs';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';

// Tabela FICTÍCIA em 2001 (só mecânica de cálculo; não é a tabela legal).
const VALID_FROM = new Date('2001-01-01');
const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;
let processor: Awaited<ReturnType<typeof clientFor>>;
let token = '';
let taxTableId = '';
const emp = { full: '', half: '' };
let runId = '';

beforeAll(async () => {
  await prisma.taxTable.deleteMany({ where: { validFrom: VALID_FROM } });
  taxTableId = (
    await prisma.taxTable.create({
      data: {
        validFrom: VALID_FROM,
        inssEmployeeRate: 3,
        inssEmployerRate: 8,
        irtBrackets: [
          { upTo: 100_000, fixed: 0, rate: 0, excessOver: 0 },
          { upTo: 200_000, fixed: 1_000, rate: 10, excessOver: 100_000 },
          { upTo: null, fixed: 11_000, rate: 20, excessOver: 200_000 },
        ],
      },
    })
  ).id;
  T = await createTestTenant({ name: 'Pay', plan: 'COMPLETO', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  api = await clientFor(app, T.email);
  token = (
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: T.email, password: 'password123' },
    })
  ).json().data.accessToken;
  const role = await db.role.create({
    data: {
      name: 'Processador',
      permissions: { connect: ['payroll.process', 'hr.view'].map((code) => ({ code })) },
    },
  });
  const u = await db.user.create({
    data: {
      name: 'p',
      email: `proc-${T.tenant.id}@test.local`,
      passwordHash: await argon2.hash('password123'),
      roleId: role.id,
      allUnits: true,
    },
  });
  processor = await clientFor(app, u.email);

  emp.full = (
    await api('POST', '/api/employees', {
      number: 'P1',
      name: 'Ana',
      unitId: T.unit.id,
      hireDate: '2000-06-01',
      sensitive: {
        baseSalary: 200_000,
        allowances: [
          { name: 'Transporte', amount: 30_000, inssSubject: false, irtExemptUpTo: 20_000 },
        ],
      },
    })
  ).json().data.id;
  emp.half = (
    await api('POST', '/api/employees', {
      number: 'P2',
      name: 'Bruno',
      unitId: T.unit.id,
      hireDate: '2001-01-16',
      sensitive: { baseSalary: 90_000 },
    })
  ).json().data.id;
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await prisma.taxTable.deleteMany({ where: { id: taxTableId } });
  await app.close();
  await prisma.$disconnect();
});

describe('salários', () => {
  it('exige os parâmetros de salários do tenant', async () => {
    const res = await api('POST', '/api/payroll-runs', { unitId: T.unit.id, year: 2001, month: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('parâmetros de salários');
    await api('PATCH', '/api/settings', {
      payrollWeeklyHours: 40,
      payrollOvertimeRate: 1.5,
      payrollMonthDays: 30,
    });
  });

  it('processa: proporcionalidade, horas extra, faltas, subsídios, INSS, IRT e adiantamento', async () => {
    await api('POST', `/api/employees/${emp.full}/deductions`, {
      type: 'ADVANCE',
      description: 'Adiantamento',
      date: '2001-01-05',
      amount: 60_000,
      installments: 2,
    });
    await api('PUT', `/api/attendance?unitId=${T.unit.id}`, {
      date: '2001-01-10',
      records: [{ employeeId: emp.full, status: 'PRESENT', overtimeMinutes: 240 }],
    });
    for (const d of ['2001-01-11', '2001-01-12', '2001-01-15']) {
      await api('PUT', `/api/attendance?unitId=${T.unit.id}`, {
        date: d,
        records: [{ employeeId: emp.full, status: 'ABSENT_UNJUSTIFIED' }],
      });
    }
    const res = await processor('POST', '/api/payroll-runs', {
      unitId: T.unit.id,
      year: 2001,
      month: 1,
    });
    expect(res.statusCode).toBe(201);
    const run = res.json().data;
    runId = run.id;
    const ana = run.lines.find((l: { employeeId: string }) => l.employeeId === emp.full);
    expect(ana).toMatchObject({
      baseSalary: 200_000,
      allowances: 30_000,
      overtime: 6_923,
      absenceDeduction: 20_000,
      gross: 216_923,
      deductions: 30_000,
    });
    expect(ana.inssBase).toBe(186_923); // transporte não sujeito
    expect(ana.inssEmployee).toBe(5_608);
    expect(ana.net).toBe(ana.gross - ana.inssEmployee - ana.irt - ana.deductions);
    const bruno = run.lines.find((l: { employeeId: string }) => l.employeeId === emp.half);
    expect(bruno.baseSalary).toBe(48_000); // 16 dias de 30
    expect(run.totalCost).toBe(
      run.lines.reduce(
        (s: number, l: { gross: number; inssEmployer: number }) => s + l.gross + l.inssEmployer,
        0,
      ),
    );
  });

  it('aprovação exige payroll.approve, abate a prestação e bloqueia o recálculo', async () => {
    expect((await processor('POST', `/api/payroll-runs/${runId}/approve`)).statusCode).toBe(403);
    expect((await api('POST', `/api/payroll-runs/${runId}/approve`)).json().data.status).toBe(
      'APPROVED',
    );
    const [d] = (await api('GET', `/api/employees/${emp.full}/deductions`)).json().data;
    expect(d.remaining).toBe(30_000);
    expect(
      (await processor('POST', '/api/payroll-runs', { unitId: T.unit.id, year: 2001, month: 1 }))
        .statusCode,
    ).toBe(409);
    expect((await api('POST', `/api/payroll-runs/${runId}/pay`)).json().data.status).toBe('PAID');
  });

  it('recibos em PDF e mapa em Excel', async () => {
    const pdf = await app.inject({
      url: `/api/payroll-runs/${runId}/payslips.pdf`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    const xlsx = await app.inject({
      url: `/api/payroll-runs/${runId}/map.xlsx`,
      headers: { authorization: `Bearer ${token}` },
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.rawPayload as unknown as ArrayBuffer);
    const values = wb.worksheets[0]!.getColumn(2).values as unknown[];
    expect(values).toContain('Total');
  });

  it('Super Admin valida a tabela fiscal e não altera tabelas já usadas', async () => {
    const email = `sa-pay-${Date.now()}@test.local`;
    await prisma.superAdmin.create({
      data: { email, name: 'SA', passwordHash: await argon2.hash('superpassword') },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { email, password: 'superpassword' },
    });
    const adm = login.cookies.find((c) => c.name === 'adm')!.value;
    const body = {
      validFrom: '2001-01-01',
      inssEmployeeRate: 3,
      inssEmployerRate: 8,
      irtBrackets: [
        { upTo: null, fixed: 0, rate: 0, excessOver: 0 },
        { upTo: null, fixed: 0, rate: 1, excessOver: 0 },
      ],
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/tax-tables',
          payload: body,
          cookies: { adm },
        })
      ).statusCode,
    ).toBe(400);
    const put = await app.inject({
      method: 'PUT',
      url: `/api/admin/tax-tables/${taxTableId}`,
      payload: { ...body, irtBrackets: [body.irtBrackets[0]] },
      cookies: { adm },
    });
    expect(put.statusCode).toBe(409);
    await prisma.superAdmin.deleteMany({ where: { email } });
  });
});
