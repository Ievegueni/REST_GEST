import type { z } from 'zod';
import type { AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import type { productPatchSchema, productSchema } from './schemas';

type Db = AuthContext['db'];

/** Impede que uma categoria passe a ser descendente de si própria. */
export async function assertNoCycle(db: Db, id: string, parentId: string | null) {
  let current = parentId;
  for (let depth = 0; current; depth++) {
    if (current === id || depth > 50)
      throw new AppError('VALIDATION_ERROR', 'Hierarquia de categorias inválida');
    current = (await db.category.findUniqueOrThrow({ where: { id: current } })).parentId;
  }
}

const productInclude = {
  category: { select: { id: true, name: true } },
  stockUnit: { select: { id: true, symbol: true } },
  conversions: { include: { unit: { select: { symbol: true } } } },
  locationLimits: true,
  supplierProducts: { include: { supplier: { select: { id: true, name: true } } } },
} as const;

export function getProduct(db: Db, id: string) {
  return db.product.findUniqueOrThrow({ where: { id }, include: productInclude });
}

type ProductInput = z.infer<typeof productPatchSchema>;

/** Unidades de compra/consumo precisam de conversão para a unidade de stock. */
function validateUnits(
  p: Required<
    Pick<ProductInput, 'stockUnitId' | 'purchaseUnitId' | 'consumptionUnitId' | 'conversions'>
  >,
) {
  const convertible = new Set([p.stockUnitId, ...p.conversions.map((c) => c.unitId)]);
  if (p.conversions.some((c) => c.unitId === p.stockUnitId)) {
    throw new AppError('VALIDATION_ERROR', 'A unidade de stock não precisa de conversão');
  }
  if (new Set(p.conversions.map((c) => c.unitId)).size !== p.conversions.length) {
    throw new AppError('VALIDATION_ERROR', 'Conversão repetida para a mesma unidade');
  }
  for (const u of [p.purchaseUnitId, p.consumptionUnitId]) {
    if (u && !convertible.has(u))
      throw new AppError('VALIDATION_ERROR', 'Falta a conversão da unidade de compra/consumo');
  }
}

export async function saveProduct(
  db: Db,
  id: string | null,
  input: ProductInput | z.infer<typeof productSchema>,
) {
  const { conversions, limits, ...data } = input;
  const current = id ? await getProduct(db, id) : null;
  validateUnits({
    stockUnitId: data.stockUnitId ?? current!.stockUnitId,
    purchaseUnitId:
      data.purchaseUnitId !== undefined ? data.purchaseUnitId : (current?.purchaseUnitId ?? null),
    consumptionUnitId:
      data.consumptionUnitId !== undefined
        ? data.consumptionUnitId
        : (current?.consumptionUnitId ?? null),
    conversions:
      conversions ??
      current?.conversions.map((c) => ({ unitId: c.unitId, factor: Number(c.factor) })) ??
      [],
  });

  // ponytail: a unidade de stock só deve mudar antes de haver movimentos — validar no Sprint 4.
  const productId = await db.$transaction(async (tx) => {
    const p = id
      ? await tx.product.update({ where: { id }, data })
      : await tx.product.create({
          data: data as Omit<z.infer<typeof productSchema>, 'conversions' | 'limits'>,
        });
    if (conversions) {
      await tx.productUnitConversion.deleteMany({ where: { productId: p.id } });
      await tx.productUnitConversion.createMany({
        data: conversions.map((c) => ({ ...c, productId: p.id })),
      });
    }
    if (limits) {
      await tx.productLocationLimit.deleteMany({ where: { productId: p.id } });
      await tx.productLocationLimit.createMany({
        data: limits
          .filter((l) => l.minQty != null || l.maxQty != null)
          .map((l) => ({ ...l, productId: p.id })),
      });
    }
    return p.id;
  });
  return getProduct(db, productId);
}
