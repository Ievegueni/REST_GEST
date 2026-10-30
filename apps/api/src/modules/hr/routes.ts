import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canAccessUnit, protect } from '../../core/auth';
import { idParam } from '../../core/schemas';
import {
  attendanceSchema,
  decideSchema,
  departmentSchema,
  documentSchema,
  employeeSchema,
  leaveSchema,
  positionSchema,
  sensitiveSchema,
  shiftsSchema,
} from './schemas';
import * as service from './service';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function hrRoutes(app: FastifyInstance) {
  const view = protect({ feature: 'hr', permission: 'hr.view' });
  const manage = protect({ feature: 'hr', permission: 'hr.manage' });
  const sensitive = protect({ feature: 'hr', permission: 'hr.sensitive' });

  // ---- Departamentos e cargos
  app.get('/departments', view, async (req) => ({
    data: await req.auth.db.department.findMany({ orderBy: { name: 'asc' } }),
  }));
  app.post('/departments', manage, async (req, reply) =>
    reply.status(201).send({
      data: await req.auth.db.department.create({ data: departmentSchema.parse(req.body) }),
    }),
  );
  app.patch('/departments/:id', manage, async (req) => ({
    data: await req.auth.db.department.update({
      where: { id: idParam.parse(req.params).id },
      data: departmentSchema.partial().parse(req.body),
    }),
  }));
  app.get('/positions', view, async (req) => ({
    data: await req.auth.db.position.findMany({
      orderBy: { name: 'asc' },
      include: { department: { select: { name: true } } },
    }),
  }));
  app.post('/positions', manage, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await req.auth.db.position.create({ data: positionSchema.parse(req.body) }) }),
  );
  app.patch('/positions/:id', manage, async (req) => ({
    data: await req.auth.db.position.update({
      where: { id: idParam.parse(req.params).id },
      data: positionSchema.partial().parse(req.body),
    }),
  }));

  // ---- Funcionários (corpo: campos gerais + `sensitive` opcional)
  app.get('/employees', view, async (req) => ({
    data: await service.listEmployees(req.auth, req.query as { unitId?: string; active?: string }),
  }));
  app.get('/employees/:id', view, async (req) => ({
    data: await service.getEmployee(req.auth, idParam.parse(req.params).id),
  }));

  const parseEmployee = (body: unknown) => {
    const b = (body ?? {}) as { sensitive?: unknown };
    return {
      general: employeeSchema.parse(body),
      sensitive: b.sensitive ? sensitiveSchema.parse(b.sensitive) : null,
    };
  };
  app.post('/employees', manage, async (req, reply) => {
    const { general, sensitive } = parseEmployee(req.body);
    return reply
      .status(201)
      .send({ data: await service.saveEmployee(req.auth, null, general, sensitive, req.ip) });
  });
  app.put('/employees/:id', manage, async (req) => {
    const { general, sensitive } = parseEmployee(req.body);
    return {
      data: await service.saveEmployee(
        req.auth,
        idParam.parse(req.params).id,
        general,
        sensitive,
        req.ip,
      ),
    };
  });

  // ---- Documentos (sensíveis; ficheiro enviado antes por /uploads)
  app.post('/employees/:id/documents', sensitive, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await service.getEmployee(req.auth, id); // valida acesso à unidade
    const data = await req.auth.db.employeeDocument.create({
      data: { ...documentSchema.parse(req.body), employeeId: id },
    });
    return reply.status(201).send({ data });
  });
  app.delete<{ Params: { id: string; docId: string } }>(
    '/employees/:id/documents/:docId',
    sensitive,
    async (req) => {
      await service.getEmployee(req.auth, req.params.id);
      await req.auth.db.employeeDocument.deleteMany({
        where: { id: req.params.docId, employeeId: req.params.id },
      });
      return { data: { ok: true } };
    },
  );

  // ---- Escalas
  app.get('/shifts', view, async (req) => {
    const q = z.object({ unitId: z.string().min(1), weekStart: day }).parse(req.query);
    return { data: await service.getWeek(req.auth, q.unitId, q.weekStart) };
  });
  app.put('/shifts', manage, async (req) => ({
    data: await service.saveWeek(req.auth, shiftsSchema.parse(req.body)),
  }));

  // ---- Presenças
  app.get('/attendance', view, async (req) => {
    const q = z.object({ unitId: z.string().min(1), date: day }).parse(req.query);
    return { data: await service.getDay(req.auth, q.unitId, q.date) };
  });
  app.put('/attendance', manage, async (req) => {
    const { unitId } = z.object({ unitId: z.string().min(1) }).parse(req.query);
    return { data: await service.saveDay(req.auth, unitId, attendanceSchema.parse(req.body)) };
  });
  app.get('/attendance/summary', view, async (req) => {
    const q = z
      .object({ unitId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) })
      .parse(req.query);
    return { data: await service.monthSummary(req.auth, q.unitId, q.month) };
  });

  // ---- Férias e licenças
  app.get('/leaves', view, async (req) => {
    const q = z
      .object({ status: z.string().optional(), employeeId: z.string().optional() })
      .parse(req.query);
    const rows = await req.auth.db.leave.findMany({
      where: {
        ...(q.status && { status: q.status as never }),
        ...(q.employeeId && { employeeId: q.employeeId }),
      },
      orderBy: { startDate: 'desc' },
      take: 500,
      include: { employee: { select: { id: true, name: true, number: true, unitId: true } } },
    });
    return { data: rows.filter((l) => canAccessUnit(req.auth, l.employee.unitId)) };
  });
  app.post('/leaves', manage, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await service.requestLeave(req.auth, leaveSchema.parse(req.body)) }),
  );
  app.post('/leaves/:id/decide', manage, async (req) => ({
    data: await service.decideLeave(
      req.auth,
      idParam.parse(req.params).id,
      decideSchema.parse(req.body).decision,
    ),
  }));
  app.get('/employees/:id/vacation-balance', view, async (req) => {
    const { year } = z
      .object({ year: z.coerce.number().int().min(2000).max(2100) })
      .parse(req.query);
    return { data: await service.vacationBalance(req.auth, idParam.parse(req.params).id, year) };
  });
}
