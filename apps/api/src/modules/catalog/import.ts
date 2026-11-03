import ExcelJS from 'exceljs';
import type { AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';

/** Carga inicial de produtos. ponytail: processado no pedido (limite 5000 linhas); worker BullMQ se crescer. */
export const MAX_ROWS = 5000;

const COLUMNS = {
  code: 'Código',
  name: 'Nome',
  category: 'Categoria',
  unit: 'Unidade',
  tracksLots: 'Controla lote',
  reorderPoint: 'Ponto de encomenda',
  active: 'Activo',
} as const;
type Col = keyof typeof COLUMNS;
const REQUIRED: Col[] = ['code', 'name', 'category', 'unit'];

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v)
      return v.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    return '';
  }
  return String(v).trim();
}

function parseBool(s: string, dflt: boolean): boolean | null {
  const v = norm(s);
  if (v === '') return dflt;
  if (['sim', 's', 'yes', 'true', '1', 'x'].includes(v)) return true;
  if (['nao', 'n', 'no', 'false', '0'].includes(v)) return false;
  return null;
}

export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Produtos');
  ws.addRow(Object.values(COLUMNS)).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 22));
  const help = wb.addWorksheet('Instruções');
  [
    ['Código', 'Obrigatório. Único. Se já existir, o produto é actualizado.'],
    ['Nome', 'Obrigatório.'],
    [
      'Categoria',
      'Obrigatório. Use ">" para subcategorias, ex.: Bebidas > Cervejas. Criada se não existir.',
    ],
    ['Unidade', 'Obrigatório. Símbolo da unidade de stock já registada (ex.: un, kg, gf).'],
    ['Controla lote', 'sim / não (por defeito: não).'],
    ['Ponto de encomenda', 'Opcional. Quantidade na unidade de stock.'],
    ['Activo', 'sim / não (por defeito: sim).'],
  ].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 22;
  help.getColumn(2).width = 90;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type ParsedRow = {
  row: number;
  code: string;
  name: string;
  categoryPath: string[];
  stockUnitId: string;
  tracksLots: boolean;
  reorderPoint: number | null;
  active: boolean;
};

export async function importProducts(auth: AuthContext, file: Buffer, dryRun: boolean) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Ficheiro Excel inválido (.xlsx)');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new AppError('VALIDATION_ERROR', 'Ficheiro sem folhas');
  if (ws.actualRowCount - 1 > MAX_ROWS)
    throw new AppError('VALIDATION_ERROR', `Máximo de ${MAX_ROWS} linhas`);

  // Cabeçalho: colunas identificadas pelo nome, em qualquer ordem.
  const colIndex: Partial<Record<Col, number>> = {};
  ws.getRow(1).eachCell((cell, i) => {
    const h = norm(cellText(cell.value));
    const key = (Object.keys(COLUMNS) as Col[]).find((k) => norm(COLUMNS[k]) === h);
    if (key) colIndex[key] = i;
  });
  const missing = REQUIRED.filter((k) => !colIndex[k]).map((k) => COLUMNS[k]);
  if (missing.length)
    throw new AppError('VALIDATION_ERROR', `Colunas em falta: ${missing.join(', ')}`);

  const units = await auth.db.measureUnit.findMany();
  const unitBySymbol = new Map(units.map((u) => [norm(u.symbol), u.id]));

  const errors: { row: number; message: string }[] = [];
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();

  ws.eachRow((r, n) => {
    if (n === 1) return;
    const get = (k: Col) => (colIndex[k] ? cellText(r.getCell(colIndex[k]!).value) : '');
    if ((Object.keys(COLUMNS) as Col[]).every((k) => !get(k))) return; // linha vazia
    const err = (message: string) => errors.push({ row: n, message });

    const code = get('code');
    const name = get('name');
    const categoryPath = get('category')
      .split('>')
      .map((s) => s.trim())
      .filter(Boolean);
    const stockUnitId = unitBySymbol.get(norm(get('unit')));
    const tracksLots = parseBool(get('tracksLots'), false);
    const active = parseBool(get('active'), true);
    const rp = get('reorderPoint').replace(',', '.');
    const reorderPoint = rp === '' ? null : Number(rp);

    if (!code) return err('Código em falta');
    if (seen.has(norm(code))) return err(`Código ${code} repetido no ficheiro`);
    seen.add(norm(code));
    if (!name) return err('Nome em falta');
    if (!categoryPath.length) return err('Categoria em falta');
    if (!stockUnitId) return err(`Unidade "${get('unit')}" não existe`);
    if (tracksLots === null) return err('"Controla lote" deve ser sim ou não');
    if (active === null) return err('"Activo" deve ser sim ou não');
    if (reorderPoint !== null && !(reorderPoint >= 0)) return err('Ponto de encomenda inválido');

    rows.push({ row: n, code, name, categoryPath, stockUnitId, tracksLots, reorderPoint, active });
  });

  const existing = new Map(
    (
      await auth.db.product.findMany({
        where: { code: { in: rows.map((r) => r.code) } },
        select: { id: true, code: true },
      })
    ).map((p) => [p.code, p.id]),
  );
  const summary = {
    total: rows.length + errors.length,
    create: rows.filter((r) => !existing.has(r.code)).length,
    update: rows.filter((r) => existing.has(r.code)).length,
    errors,
  };
  if (dryRun || errors.length) return { ...summary, applied: false };

  await auth.db.$transaction(
    async (tx) => {
      // Mapa caminho → id das categorias existentes ("bebidas>cervejas")
      const cats = await tx.category.findMany();
      const byId = new Map(cats.map((c) => [c.id, c]));
      const pathOf = (id: string): string => {
        const c = byId.get(id)!;
        return (c.parentId ? pathOf(c.parentId) + '>' : '') + norm(c.name);
      };
      const byPath = new Map(cats.map((c) => [pathOf(c.id), c.id]));

      const ensureCategory = async (path: string[]) => {
        let parentId: string | null = null;
        let key = '';
        for (const name of path) {
          key = key ? `${key}>${norm(name)}` : norm(name);
          let id = byPath.get(key);
          if (!id) {
            id = (await tx.category.create({ data: { name, parentId } })).id;
            byPath.set(key, id);
          }
          parentId = id;
        }
        return parentId!;
      };

      for (const r of rows) {
        const data = {
          name: r.name,
          categoryId: await ensureCategory(r.categoryPath),
          stockUnitId: r.stockUnitId,
          tracksLots: r.tracksLots,
          reorderPoint: r.reorderPoint,
          active: r.active,
        };
        const id = existing.get(r.code);
        if (id) await tx.product.update({ where: { id }, data });
        else await tx.product.create({ data: { ...data, code: r.code } });
      }
    },
    { timeout: 120_000 },
  );
  return { ...summary, applied: true };
}
