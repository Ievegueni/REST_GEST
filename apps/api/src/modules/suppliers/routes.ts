import type { FastifyInstance } from 'fastify';
import { protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import { supplierProductsSchema, supplierSchema } from './schemas';

export async function supplierRoutes(app: FastifyInstance) {
  const view = protect({ feature: 'stock', permission: 'catalog.view' });
  const manage = protect({ feature: 'stock', permission: 'catalog.manage' });

  app.get('/suppliers', view, async (req) => ({
    data: await req.auth.db.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    }),
  }));

  app.get('/suppliers/:id', view, async (req) => {
    const { id } = idParam.parse(req.params);
    return {
      data: await req.auth.db.supplier.findUniqueOrThrow({
        where: { id },
        include: {
          products: {
            include: { product: { select: { id: true, code: true, name: true } } },
            orderBy: { product: { name: 'asc' } },
          },
        },
      }),
    };
  });

  app.post('/suppliers', manage, async (req, reply) => {
    const data = supplierSchema.parse(req.body);
    return reply.status(201).send({ data: await req.auth.db.supplier.create({ data }) });
  });

  app.patch('/suppliers/:id', manage, async (req) => {
    const { id } = idParam.parse(req.params);
    const data = supplierSchema.partial().parse(req.body);
    return { data: await req.auth.db.supplier.update({ where: { id }, data }) };
  });

  /** Substitui a lista de produtos fornecidos; o preço só ganha nova data quando muda. */
  app.put('/suppliers/:id/products', manage, async (req) => {
    const { id: supplierId } = idParam.parse(req.params);
    const items = supplierProductsSchema.parse(req.body);
    if (new Set(items.map((i) => i.productId)).size !== items.length) {
      throw new AppError('VALIDATION_ERROR', 'Produto repetido');
    }
    const db = req.auth.db;
    await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const before = new Map(
      (await db.supplierProduct.findMany({ where: { supplierId } })).map((p) => [p.productId, p]),
    );
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.supplierProduct.deleteMany({ where: { supplierId } });
      await tx.supplierProduct.createMany({
        data: items.map((i) => {
          const old = before.get(i.productId);
          const changed = i.lastPrice !== (old?.lastPrice ?? null);
          return {
            ...i,
            supplierId,
            lastPriceAt: changed ? (i.lastPrice == null ? null : now) : (old?.lastPriceAt ?? null),
          };
        }),
      });
    });
    return { data: await db.supplierProduct.findMany({ where: { supplierId } }) };
  });
}
