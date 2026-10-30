import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { audit } from '../../core/audit';
import { assertUnitAccess, tenantFeatures, type AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import { tenantDb } from '../../core/prisma';
import { nextNumber } from '../../core/sequence';
import { storeFile, XLSX_MIME } from '../../integrations/storage';
import { defineJob } from '../../jobs/queue';
import { explode, loadRecipeBook, outputLocationResolver } from '../recipes/book';
import { postMovements, reverseMovements, type MovementInput } from '../stock/engine';
import { parseSalesFile, type ProfileConfig } from './parse';

const D = Prisma.Decimal;
const REF = 'SalesImport';

// ---------- Upload + job de leitura ----------

type ParseJob = { tenantId: string; importId: string; file: string; fallbackDate: string | null };

export const parseJob = defineJob<ParseJob>(
  'sales-import-parse',
  async ({ tenantId, importId, file, fallbackDate }) => {
    const db = tenantDb(tenantId);
    const fail = (message: string) =>
      db.salesImport.update({
        where: { id: importId },
        data: { status: 'FAILED', errors: [{ row: 0, message }] },
      });

    if (!(await tenantFeatures(tenantId)).has('sales_import'))
      return void (await fail('Funcionalidade não incluída no plano'));
    const imp = await db.salesImport.findUniqueOrThrow({
      where: { id: importId },
      include: { profile: true },
    });
    if (imp.status !== 'PROCESSING') return;

    let result;
    try {
      result = await parseSalesFile(
        Buffer.from(file, 'base64'),
        imp.profile as unknown as ProfileConfig,
        fallbackDate,
      );
    } catch (e) {
      return void (await fail((e as Error).message));
    }
    if (!result.rows.length) return void (await fail('Nenhuma linha de venda encontrada'));

    const dates = result.rows.map((r) => r.saleDate).sort();
    const periodFrom = new Date(dates[0]!);
    const periodTo = new Date(dates.at(-1)!);
    const overlap = await db.salesImport.findFirst({
      where: {
        id: { not: importId },
        unitId: imp.unitId,
        status: { in: ['READY', 'CONFIRMED'] },
        periodFrom: { lte: periodTo },
        periodTo: { gte: periodFrom },
      },
    });
    if (overlap) {
      return void (await fail(
        `Período sobreposto com a importação nº ${overlap.number}. Anule-a para reimportar.`,
      ));
    }

    await db.$transaction(async (tx) => {
      await tx.salesImportLine.createMany({
        data: result.rows.map((r) => ({
          importId,
          rowNumber: r.row,
          posCode: r.posCode,
          posLabel: r.posLabel,
          qty: r.qty,
          amount: r.amount,
          saleDate: new Date(r.saleDate),
        })),
      });
      await tx.salesImport.update({
        where: { id: importId },
        data: {
          status: 'READY',
          periodFrom,
          periodTo,
          rowCount: result.rows.length,
          totalAmount: result.rows.reduce((s, r) => s + r.amount, 0),
          errors: result.errors,
        },
      });
    });
  },
);

export async function createImport(
  auth: AuthContext,
  input: { unitId: string; profileId: string; saleDate?: string },
  file: { buffer: Buffer; filename: string },
) {
  assertUnitAccess(auth, input.unitId);
  if (!/\.xlsx$/i.test(file.filename))
    throw new AppError('VALIDATION_ERROR', 'Envie um ficheiro .xlsx');
  const db = auth.db;
  const profile = await db.importProfile.findUniqueOrThrow({ where: { id: input.profileId } });
  if (!profile.active) throw new AppError('VALIDATION_ERROR', 'Perfil inactivo');

  const fileHash = createHash('sha256').update(file.buffer).digest('hex');
  const dup = await db.salesImport.findFirst({
    where: { fileHash, status: { notIn: ['CANCELLED', 'FAILED'] } },
  });
  if (dup)
    throw new AppError('CONFLICT', `Este ficheiro já foi importado (importação nº ${dup.number})`);

  const stored = await storeFile(auth.tenantId, { ...file, mimetype: XLSX_MIME }, [XLSX_MIME]);
  const imp = await db.$transaction(async (tx) =>
    tx.salesImport.create({
      data: {
        number: await nextNumber(tx, auth.tenantId, 'SI'),
        unitId: input.unitId,
        profileId: input.profileId,
        fileName: file.filename,
        fileUrl: stored.url,
        fileHash,
        createdById: auth.userId,
      },
    }),
  );
  await parseJob.enqueue({
    tenantId: auth.tenantId,
    importId: imp.id,
    file: file.buffer.toString('base64'),
    fallbackDate: input.saleDate ?? null,
  });
  return getImport(auth, imp.id);
}

// ---------- Pré-visualização ----------

/** Resumo por artigo do POS, com mapeamento, pendentes e locais de saída em falta. */
export async function getImport(auth: AuthContext, id: string) {
  const db = auth.db;
  const imp = await db.salesImport.findUniqueOrThrow({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
      profile: { select: { id: true, name: true, posName: true } },
    },
  });
  assertUnitAccess(auth, imp.unitId);

  const groups = await db.salesImportLine.groupBy({
    by: ['posCode'],
    where: { importId: id },
    _sum: { qty: true, amount: true },
    _count: { _all: true },
  });
  const pending = await db.salesImportLine.groupBy({
    by: ['posCode'],
    where: { importId: id, postedAt: null },
    _count: { _all: true },
  });
  const labels = await db.salesImportLine.findMany({
    where: { importId: id },
    distinct: ['posCode'],
    select: { posCode: true, posLabel: true },
  });
  const mappings = await db.posItemMapping.findMany({
    where: { posName: imp.profile.posName, posCode: { in: groups.map((g) => g.posCode) } },
    include: { saleItem: { select: { id: true, code: true, name: true } } },
  });
  const map = new Map(mappings.map((m) => [m.posCode, m]));
  const pend = new Map(pending.map((p) => [p.posCode, p._count._all]));
  const label = new Map(labels.map((l) => [l.posCode, l.posLabel]));

  const items = groups
    .map((g) => {
      const m = map.get(g.posCode);
      return {
        posCode: g.posCode,
        posLabel: label.get(g.posCode) ?? null,
        qty: g._sum.qty,
        amount: g._sum.amount ?? 0,
        lines: g._count._all,
        pendingLines: pend.get(g.posCode) ?? 0,
        mapping: m ? { saleItem: m.saleItem, ignore: m.ignore } : null,
      };
    })
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  return {
    ...imp,
    items,
    unmapped: items.filter((i) => !i.mapping || (!i.mapping.ignore && !i.mapping.saleItem)).length,
    pendingLines: [...pend.values()].reduce((s, n) => s + n, 0),
    missingLocations:
      imp.status === 'READY' || imp.status === 'CONFIRMED'
        ? await missingOutputLocations(auth, imp.unitId, mappings)
        : [],
  };
}

/** Categorias de ingredientes sem local de saída definido nesta unidade. */
async function missingOutputLocations(
  auth: AuthContext,
  unitId: string,
  mappings: { saleItemId: string | null }[],
) {
  const book = await loadRecipeBook(auth.db);
  const resolver = await outputLocationResolver(auth.db, unitId);
  const missing = new Set<string>();
  for (const m of mappings) {
    if (!m.saleItemId) continue;
    try {
      for (const productId of explode(book, m.saleItemId, 1).keys()) {
        const p = book.products.get(productId)!;
        if (!resolver.resolve(p.categoryId)) missing.add(resolver.categoryName(p.categoryId));
      }
    } catch {
      /* ficha inválida: aparece ao lançar */
    }
  }
  return [...missing].sort();
}

// ---------- Lançamento em stock ----------

/**
 * Lança em stock as linhas ainda não lançadas cujo artigo POS já está mapeado.
 * Vendas agregadas por produto, local e dia → SALE_OUT. Linhas sem mapeamento ficam pendentes.
 */
async function postLines(auth: AuthContext, id: string) {
  const db = auth.db;
  const imp = await db.salesImport.findUniqueOrThrow({ where: { id }, include: { profile: true } });
  assertUnitAccess(auth, imp.unitId);

  return db.$transaction(
    async (tx) => {
      const lines = await tx.salesImportLine.findMany({ where: { importId: id, postedAt: null } });
      const mappings = new Map(
        (
          await tx.posItemMapping.findMany({
            where: {
              posName: imp.profile.posName,
              posCode: { in: [...new Set(lines.map((l) => l.posCode))] },
            },
          })
        ).map((m) => [m.posCode, m]),
      );
      const book = await loadRecipeBook(tx);
      const resolver = await outputLocationResolver(tx, imp.unitId);

      const byDay = new Map<string, Map<string, Prisma.Decimal>>(); // dia → "produto|local" → qty
      const missing = new Set<string>();
      const posted: { id: string; saleItemId: string | null }[] = [];

      for (const l of lines) {
        const m = mappings.get(l.posCode);
        if (!m || (!m.ignore && !m.saleItemId)) continue; // pendente
        posted.push({ id: l.id, saleItemId: m.ignore ? null : m.saleItemId });
        if (m.ignore) continue;
        const day = l.saleDate.toISOString().slice(0, 10);
        const agg = byDay.get(day) ?? new Map();
        byDay.set(day, agg);
        for (const [productId, q] of explode(book, m.saleItemId!, l.qty)) {
          const p = book.products.get(productId)!;
          const loc = resolver.resolve(p.categoryId);
          if (!loc) {
            missing.add(resolver.categoryName(p.categoryId));
            continue;
          }
          const key = `${productId}|${loc}`;
          agg.set(key, (agg.get(key) ?? new D(0)).add(q));
        }
      }
      if (missing.size) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Defina o local de saída para: ${[...missing].sort().join(', ')}`,
        );
      }

      for (const [day, agg] of byDay) {
        const inputs: MovementInput[] = [...agg]
          .map(([key, q]) => {
            const [productId, locationId] = key.split('|') as [string, string];
            return { productId, locationId, type: 'SALE_OUT' as const, qty: q.toDecimalPlaces(3) };
          })
          .filter((i) => !i.qty.isZero());
        await postMovements(tx, inputs, {
          tenantId: auth.tenantId,
          userId: auth.userId,
          refType: REF,
          refId: id,
          occurredAt: new Date(`${day}T12:00:00Z`),
        });
      }
      const now = new Date();
      for (const p of posted)
        await tx.salesImportLine.update({
          where: { id: p.id },
          data: { saleItemId: p.saleItemId, postedAt: now },
        });
      return posted.length;
    },
    { timeout: 120_000 },
  );
}

export async function confirmImport(auth: AuthContext, id: string, ip?: string) {
  const imp = await auth.db.salesImport.findUniqueOrThrow({ where: { id } });
  if (imp.status !== 'READY')
    throw new AppError('VALIDATION_ERROR', 'Importação não está pronta para confirmar');
  const n = await postLines(auth, id);
  await auth.db.salesImport.update({
    where: { id },
    data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: auth.userId },
  });
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'sales_import.confirm',
    entity: 'SalesImport',
    entityId: id,
    after: { postedLines: n },
    ip,
  });
  return getImport(auth, id);
}

/** Lança as linhas que ficaram pendentes (depois de mapear os artigos). */
export async function postPending(auth: AuthContext, id: string) {
  const imp = await auth.db.salesImport.findUniqueOrThrow({ where: { id } });
  if (imp.status !== 'CONFIRMED')
    throw new AppError('VALIDATION_ERROR', 'Importação não confirmada');
  await postLines(auth, id);
  return getImport(auth, id);
}

/** Anula: estorna todas as saídas e liberta o período para reimportação. */
export async function cancelImport(auth: AuthContext, id: string, ip?: string) {
  const db = auth.db;
  const imp = await db.salesImport.findUniqueOrThrow({ where: { id } });
  assertUnitAccess(auth, imp.unitId);
  if (imp.status === 'CANCELLED') throw new AppError('VALIDATION_ERROR', 'Importação já anulada');
  await db.$transaction(
    async (tx) => {
      const ms = await tx.stockMovement.findMany({
        where: { refType: REF, refId: id, reversalOfId: null },
        select: { id: true },
      });
      await reverseMovements(
        tx,
        ms.map((m) => m.id),
        { tenantId: auth.tenantId, userId: auth.userId, refType: REF, refId: id },
      );
      await tx.salesImport.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: auth.userId },
      });
    },
    { timeout: 120_000 },
  );
  await audit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: 'sales_import.cancel',
    entity: 'SalesImport',
    entityId: id,
    ip,
  });
  return getImport(auth, id);
}
