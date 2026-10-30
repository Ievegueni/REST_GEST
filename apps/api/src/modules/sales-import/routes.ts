import type { FastifyInstance } from 'fastify';
import { canAccessUnit, protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import { mappingSchema, profileSchema, uploadFields } from './schemas';
import * as service from './service';

export async function salesImportRoutes(app: FastifyInstance) {
  const guard = protect({ feature: 'sales_import', permission: 'sales.import' });

  // ---- Perfis
  app.get('/import-profiles', guard, async (req) => ({
    data: await req.auth.db.importProfile.findMany({ orderBy: { name: 'asc' } }),
  }));
  app.post('/import-profiles', guard, async (req, reply) =>
    reply
      .status(201)
      .send({
        data: await req.auth.db.importProfile.create({ data: profileSchema.parse(req.body) }),
      }),
  );
  app.put('/import-profiles/:id', guard, async (req) => ({
    data: await req.auth.db.importProfile.update({
      where: { id: idParam.parse(req.params).id },
      data: profileSchema.parse(req.body),
    }),
  }));

  // ---- Mapeamento artigo POS ↔ artigo de venda
  app.get('/pos-mappings', guard, async (req) => ({
    data: await req.auth.db.posItemMapping.findMany({
      orderBy: [{ posName: 'asc' }, { posCode: 'asc' }],
      include: { saleItem: { select: { id: true, code: true, name: true } } },
    }),
  }));
  app.put('/pos-mappings', guard, async (req) => {
    const m = mappingSchema.parse(req.body);
    const data = {
      posLabel: m.posLabel,
      saleItemId: m.ignore ? null : m.saleItemId,
      ignore: m.ignore,
    };
    return {
      data: await req.auth.db.posItemMapping.upsert({
        where: {
          tenantId_posName_posCode: {
            tenantId: req.auth.tenantId,
            posName: m.posName,
            posCode: m.posCode,
          },
        },
        create: { posName: m.posName, posCode: m.posCode, ...data },
        update: data,
      }),
    };
  });

  // ---- Importações
  app.get('/sales-imports', guard, async (req) => {
    const rows = await req.auth.db.salesImport.findMany({
      orderBy: { number: 'desc' },
      take: 200,
      include: { unit: { select: { name: true } }, profile: { select: { name: true } } },
    });
    return { data: rows.filter((r) => canAccessUnit(req.auth, r.unitId)) };
  });

  /** multipart: campos unitId, profileId, saleDate? + ficheiro .xlsx */
  app.post('/sales-imports', guard, async (req, reply) => {
    const file = await req.file();
    if (!file) throw new AppError('VALIDATION_ERROR', 'Ficheiro em falta');
    const buffer = await file.toBuffer();
    const fields = Object.fromEntries(
      Object.entries(file.fields)
        .filter(([, v]) => v && typeof v === 'object' && 'value' in v)
        .map(([k, v]) => [k, (v as { value: unknown }).value]),
    );
    const input = uploadFields.parse(fields);
    return reply
      .status(201)
      .send({
        data: await service.createImport(req.auth, input, { buffer, filename: file.filename }),
      });
  });

  app.get('/sales-imports/:id', guard, async (req) => ({
    data: await service.getImport(req.auth, idParam.parse(req.params).id),
  }));
  app.post('/sales-imports/:id/confirm', guard, async (req) => ({
    data: await service.confirmImport(req.auth, idParam.parse(req.params).id, req.ip),
  }));
  app.post('/sales-imports/:id/post-pending', guard, async (req) => ({
    data: await service.postPending(req.auth, idParam.parse(req.params).id),
  }));
  app.post('/sales-imports/:id/cancel', guard, async (req) => ({
    data: await service.cancelImport(req.auth, idParam.parse(req.params).id, req.ip),
  }));
}
