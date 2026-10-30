import type { FastifyInstance } from 'fastify';
import { protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import { buildTemplate, importProducts } from './import';
import {
  categorySchema,
  measureUnitSchema,
  productListQuery,
  productPatchSchema,
  productSchema,
} from './schemas';
import { assertNoCycle, getProduct, saveProduct } from './service';

export async function catalogRoutes(app: FastifyInstance) {
  const view = protect({ feature: 'stock', permission: 'catalog.view' });
  const manage = protect({ feature: 'stock', permission: 'catalog.manage' });

  // ---- Categorias (lista plana; a árvore é montada no cliente)
  app.get('/categories', view, async (req) => ({
    data: await req.auth.db.category.findMany({ orderBy: { name: 'asc' } }),
  }));

  app.post('/categories', manage, async (req, reply) => {
    const data = categorySchema.parse(req.body);
    return reply.status(201).send({ data: await req.auth.db.category.create({ data }) });
  });

  app.patch('/categories/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const data = categorySchema.partial().parse(req.body);
    if (data.parentId !== undefined) await assertNoCycle(req.auth.db, id, data.parentId);
    return { data: await req.auth.db.category.update({ where: { id }, data }) };
  });

  // ---- Unidades de medida
  app.get('/measure-units', view, async (req) => ({
    data: await req.auth.db.measureUnit.findMany({ orderBy: { name: 'asc' } }),
  }));

  app.post('/measure-units', manage, async (req, reply) => {
    const data = measureUnitSchema.parse(req.body);
    return reply.status(201).send({ data: await req.auth.db.measureUnit.create({ data }) });
  });

  app.patch('/measure-units/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const data = measureUnitSchema.partial().parse(req.body);
    return { data: await req.auth.db.measureUnit.update({ where: { id }, data }) };
  });

  // ---- Produtos
  app.get('/products', view, async (req) => {
    const q = productListQuery.parse(req.query);
    // ponytail: limite fixo de 1000; paginação por cursor se o catálogo crescer.
    const data = await req.auth.db.product.findMany({
      where: {
        ...(q.search && {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { code: { contains: q.search, mode: 'insensitive' } },
          ],
        }),
        ...(q.categoryId && { categoryId: q.categoryId }),
        ...(q.active && { active: q.active === 'true' }),
      },
      orderBy: { name: 'asc' },
      take: 1000,
      include: { category: { select: { name: true } }, stockUnit: { select: { symbol: true } } },
    });
    return { data };
  });

  app.get('/products/import/template', manage, async (_req, reply) =>
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="modelo-produtos.xlsx"')
      .send(await buildTemplate()),
  );

  app.post('/products/import', manage, async (req) => {
    const file = await req.file();
    if (!file) throw new AppError('VALIDATION_ERROR', 'Ficheiro em falta');
    const buffer = await file.toBuffer();
    const dryRun = (req.query as { dryRun?: string }).dryRun !== 'false';
    return { data: await importProducts(req.auth, buffer, dryRun) };
  });

  app.get('/products/:id', view, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await getProduct(req.auth.db, id) };
  });

  app.post('/products', manage, async (req, reply) =>
    reply
      .status(201)
      .send({ data: await saveProduct(req.auth.db, null, productSchema.parse(req.body)) }),
  );

  app.patch('/products/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await saveProduct(req.auth.db, id, productPatchSchema.parse(req.body)) };
  });
}
