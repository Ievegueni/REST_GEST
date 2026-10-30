import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canAccessUnit, protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { idParam, money } from '../../core/schemas';
import { payrollMapXlsx, payslipsPdf } from './documents';
import * as service from './service';

const deductionSchema = z
  .object({
    type: z.enum(['ADVANCE', 'OTHER']),
    description: z.string().trim().min(1).max(200),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .transform((v) => new Date(v)),
    amount: money.refine((v) => v > 0, 'Valor obrigatório'),
    installments: z.coerce.number().int().min(1).max(60).default(1),
  })
  .transform(({ installments, ...d }) => ({
    ...d,
    installmentAmount: Math.ceil(d.amount / installments),
    remaining: d.amount,
  }));

export async function payrollRoutes(app: FastifyInstance) {
  const view = protect({ feature: 'payroll', permission: 'payroll.process' });
  const approve = protect({ feature: 'payroll', permission: 'payroll.approve' });

  // ---- Adiantamentos e descontos
  app.get('/employees/:id/deductions', view, async (req) => {
    const { id } = idParam.parse(req.params);
    const e = await req.auth.db.employee.findUniqueOrThrow({ where: { id } });
    if (!canAccessUnit(req.auth, e.unitId))
      throw new AppError('FORBIDDEN', 'Sem acesso a esta unidade');
    return {
      data: await req.auth.db.employeeDeduction.findMany({
        where: { employeeId: id },
        orderBy: { date: 'desc' },
      }),
    };
  });
  app.post('/employees/:id/deductions', view, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const e = await req.auth.db.employee.findUniqueOrThrow({ where: { id } });
    if (!canAccessUnit(req.auth, e.unitId))
      throw new AppError('FORBIDDEN', 'Sem acesso a esta unidade');
    const data = deductionSchema.parse(req.body);
    return reply
      .status(201)
      .send({
        data: await req.auth.db.employeeDeduction.create({
          data: { ...data, employeeId: id, createdById: req.auth.userId },
        }),
      });
  });
  app.delete<{ Params: { id: string } }>('/deductions/:id', view, async (req) => {
    const d = await req.auth.db.employeeDeduction.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { employee: true },
    });
    if (!canAccessUnit(req.auth, d.employee.unitId))
      throw new AppError('FORBIDDEN', 'Sem acesso a esta unidade');
    if (d.remaining !== d.amount)
      throw new AppError('VALIDATION_ERROR', 'Já foi descontado em salários aprovados');
    await req.auth.db.employeeDeduction.delete({ where: { id: d.id } });
    return { data: { ok: true } };
  });

  // ---- Processamentos
  app.get('/payroll-runs', view, async (req) => {
    const rows = await req.auth.db.payrollRun.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { unit: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    return { data: rows.filter((r) => canAccessUnit(req.auth, r.unitId)) };
  });
  app.post('/payroll-runs', view, async (req, reply) => {
    const b = z
      .object({
        unitId: z.string().min(1),
        year: z.coerce.number().int().min(2000).max(2100),
        month: z.coerce.number().int().min(1).max(12),
      })
      .parse(req.body);
    return reply
      .status(201)
      .send({ data: await service.processRun(req.auth, b.unitId, b.year, b.month) });
  });
  app.get('/payroll-runs/:id', view, async (req) => ({
    data: await service.getRun(req.auth, idParam.parse(req.params).id),
  }));
  app.post('/payroll-runs/:id/approve', approve, async (req) => ({
    data: await service.approveRun(req.auth, idParam.parse(req.params).id, req.ip),
  }));
  app.post('/payroll-runs/:id/pay', approve, async (req) => ({
    data: await service.markPaid(req.auth, idParam.parse(req.params).id, req.ip),
  }));
  app.delete('/payroll-runs/:id', view, async (req) => {
    await service.deleteDraft(req.auth, idParam.parse(req.params).id);
    return { data: { ok: true } };
  });

  app.get('/payroll-runs/:id/payslips.pdf', view, async (req, reply) => {
    const run = await service.getRun(req.auth, idParam.parse(req.params).id);
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: req.auth.tenantId },
      select: { name: true, nif: true },
    });
    return reply
      .header('content-type', 'application/pdf')
      .header(
        'content-disposition',
        `attachment; filename="recibos-${run.year}-${String(run.month).padStart(2, '0')}.pdf"`,
      )
      .send(await payslipsPdf(run, tenant));
  });
  app.get('/payroll-runs/:id/map.xlsx', view, async (req, reply) => {
    const run = await service.getRun(req.auth, idParam.parse(req.params).id);
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header(
        'content-disposition',
        `attachment; filename="mapa-salarios-${run.year}-${String(run.month).padStart(2, '0')}.xlsx"`,
      )
      .send(await payrollMapXlsx(run));
  });
}
