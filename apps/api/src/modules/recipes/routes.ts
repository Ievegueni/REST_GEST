import type { FastifyInstance } from 'fastify';
import { protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { idParam } from '../../core/schemas';
import { averageCosts, explode, loadRecipeBook, theoreticalCost } from './book';
import { outputLocationsSchema, saleItemSchema } from './schemas';

export async function recipeRoutes(app: FastifyInstance) {
  const manage = protect({ feature: 'recipes', permission: 'recipes.manage' });
  const view = protect({ feature: 'recipes', permission: 'catalog.view' });

  /** Lista com custo teórico e margem (custo médio ponderado de todas as unidades, ou de uma). */
  app.get('/sale-items', view, async (req) => {
    const { unitId } = req.query as { unitId?: string };
    const [book, avg] = await Promise.all([
      loadRecipeBook(req.auth.db),
      averageCosts(req.auth.db, unitId),
    ]);
    const data = [...book.items.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ lines, ...item }) => {
        // custo por 1 unidade (sub-receitas: por unidade do rendimento)
        let unitCost: number | null = null;
        let error: string | null = null;
        try {
          unitCost = theoreticalCost(book, item.id, avg).total.toDecimalPlaces(0).toNumber();
        } catch (e) {
          error = (e as Error).message;
        }
        return {
          ...item,
          lineCount: lines.length,
          cost: unitCost,
          margin: item.salePrice != null && unitCost != null ? item.salePrice - unitCost : null,
          marginPct:
            item.salePrice && unitCost != null
              ? Math.round(((item.salePrice - unitCost) / item.salePrice) * 1000) / 10
              : null,
          error,
        };
      });
    return { data };
  });

  app.get('/sale-items/:id', view, async (req) => {
    const { id } = idParam.parse(req.params);
    const { unitId } = req.query as { unitId?: string };
    const item = await req.auth.db.saleItem.findUniqueOrThrow({
      where: { id },
      include: {
        lines: {
          include: {
            product: {
              select: { id: true, code: true, name: true, stockUnit: { select: { symbol: true } } },
            },
            subRecipe: { select: { id: true, code: true, name: true, yieldUnit: true } },
            unit: { select: { symbol: true } },
          },
        },
      },
    });
    const [book, avg] = await Promise.all([
      loadRecipeBook(req.auth.db),
      averageCosts(req.auth.db, unitId),
    ]);
    let breakdown = null;
    try {
      breakdown = theoreticalCost(book, id, avg);
    } catch {
      /* ficha inválida: mostra-se sem custo */
    }
    return { data: { ...item, breakdown } };
  });

  const save = async (req: import('fastify').FastifyRequest, id: string | null) => {
    const { lines, ...data } = saleItemSchema.parse(req.body);
    const db = req.auth.db;
    return db.$transaction(async (tx) => {
      const item = id
        ? await tx.saleItem.update({ where: { id }, data })
        : await tx.saleItem.create({ data });
      await tx.recipeLine.deleteMany({ where: { saleItemId: item.id } });
      await tx.recipeLine.createMany({ data: lines.map((l) => ({ ...l, saleItemId: item.id })) });
      if (lines.some((l) => l.subRecipeId === item.id))
        throw new AppError('VALIDATION_ERROR', 'A ficha não pode usar-se a si própria');
      explode(await loadRecipeBook(tx), item.id, 1); // valida conversões e ciclos
      return item;
    });
  };

  app.post('/sale-items', manage, async (req, reply) =>
    reply.status(201).send({ data: await save(req, null) }),
  );
  app.put('/sale-items/:id', manage, async (req) => ({
    data: await save(req, idParam.parse(req.params).id),
  }));

  app.get('/category-output-locations', view, async (req) => ({
    data: await req.auth.db.categoryOutputLocation.findMany(),
  }));

  /** Define/limpa o local de saída por categoria e unidade (locationId null = remover). */
  app.put('/category-output-locations', manage, async (req) => {
    const items = outputLocationsSchema.parse(req.body);
    const db = req.auth.db;
    await db.$transaction(async (tx) => {
      for (const i of items) {
        if (i.locationId) {
          const loc = await tx.stockLocation.findUniqueOrThrow({ where: { id: i.locationId } });
          if (loc.unitId !== i.unitId)
            throw new AppError('VALIDATION_ERROR', 'Local fora da unidade');
          await tx.categoryOutputLocation.upsert({
            where: { categoryId_unitId: { categoryId: i.categoryId, unitId: i.unitId } },
            create: { categoryId: i.categoryId, unitId: i.unitId, locationId: i.locationId },
            update: { locationId: i.locationId },
          });
        } else {
          await tx.categoryOutputLocation.deleteMany({
            where: { categoryId: i.categoryId, unitId: i.unitId },
          });
        }
      }
    });
    return { data: await db.categoryOutputLocation.findMany() };
  });
}
