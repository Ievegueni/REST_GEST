import ExcelJS from 'exceljs';
import type { AuthContext } from '../../core/auth';
import { AppError } from '../../core/errors';
import { cellText, norm } from '../catalog/import';

/**
 * Linhas de uma recepção a partir de Excel. Não grava nada: devolve as linhas já
 * resolvidas (produto, unidade) para o utilizador rever no formulário antes de lançar.
 */
export const MAX_ROWS = 500; // = máximo de linhas de uma recepção

const COLUMNS = {
  code: 'Código',
  qty: 'Quantidade',
  unit: 'Unidade',
  unitPrice: 'Preço unitário',
  lotCode: 'Lote',
  expiryDate: 'Validade',
} as const;
type Col = keyof typeof COLUMNS;
const REQUIRED: Col[] = ['code', 'qty', 'unitPrice'];

export async function buildReceiptTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Recepção');
  ws.addRow(Object.values(COLUMNS)).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 20));
  const help = wb.addWorksheet('Instruções');
  [
    ['Código', 'Obrigatório. Código do artigo no catálogo.'],
    ['Quantidade', 'Obrigatório. Maior que zero.'],
    [
      'Unidade',
      'Opcional. Símbolo da unidade (ex.: cx, gf, kg). Vazio = unidade de stock do artigo. Outras unidades precisam de conversão definida no artigo.',
    ],
    ['Preço unitário', 'Obrigatório. Em Kz, por unidade indicada na coluna Unidade.'],
    ['Lote', 'Só para artigos que controlam lote.'],
    ['Validade', 'Só para artigos que controlam lote. Data (dd/mm/aaaa).'],
  ].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 18;
  help.getColumn(2).width = 100;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function parseNumber(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number') return v;
  let s = cellText(v).replace(/\s/g, '');
  if (!s) return null;
  // "1.234,50" ou "1234,5" → formato PT; "1234.5" mantém-se
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isoDate(y: string, m: string, d: string): string | undefined {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : undefined;
}

/** null = vazia; undefined = inválida. */
function parseDate(v: ExcelJS.CellValue): string | null | undefined {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return isoDate(m[3]!, m[2]!, m[1]!);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isoDate(m[1]!, m[2]!, m[3]!);
  return undefined;
}

export type ImportedLine = {
  row: number;
  productId: string;
  code: string;
  name: string;
  qty: number;
  /** '' = unidade de stock do artigo */
  unitId: string;
  unitPrice: number;
  lotCode: string;
  expiryDate: string;
};

export async function parseReceiptLines(auth: AuthContext, file: Buffer) {
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

  const colIndex: Partial<Record<Col, number>> = {};
  ws.getRow(1).eachCell((cell, i) => {
    const h = norm(cellText(cell.value));
    const key = (Object.keys(COLUMNS) as Col[]).find((k) => norm(COLUMNS[k]) === h);
    if (key) colIndex[key] = i;
  });
  const missing = REQUIRED.filter((k) => !colIndex[k]).map((k) => COLUMNS[k]);
  if (missing.length)
    throw new AppError('VALIDATION_ERROR', `Colunas em falta: ${missing.join(', ')}`);

  const products = await auth.db.product.findMany({
    where: { active: true },
    select: {
      id: true,
      code: true,
      name: true,
      tracksLots: true,
      stockUnit: { select: { symbol: true } },
      conversions: { select: { unitId: true, unit: { select: { symbol: true } } } },
    },
  });
  const byCode = new Map(products.map((p) => [norm(p.code), p]));

  const lines: ImportedLine[] = [];
  const errors: { row: number; message: string }[] = [];

  ws.eachRow((r, row) => {
    if (row === 1) return;
    const raw = (k: Col) => (colIndex[k] ? r.getCell(colIndex[k]!).value : null);
    const get = (k: Col) => cellText(raw(k));
    const code = get('code');
    if (!code && !get('qty') && !get('unitPrice')) return; // linha vazia
    const err = (message: string) => errors.push({ row, message });

    if (!code) return err('Código em falta');
    const p = byCode.get(norm(code));
    if (!p) return err(`Artigo ${code} não existe ou está inactivo`);

    const qty = parseNumber(raw('qty'));
    if (qty == null || qty <= 0) return err('Quantidade inválida');
    const unitPrice = parseNumber(raw('unitPrice'));
    if (unitPrice == null || unitPrice < 0) return err('Preço unitário inválido');

    let unitId = '';
    const sym = norm(get('unit'));
    if (sym && sym !== norm(p.stockUnit.symbol)) {
      const c = p.conversions.find((c) => norm(c.unit.symbol) === sym);
      if (!c) return err(`Artigo ${p.code} não tem conversão para a unidade "${get('unit')}"`);
      unitId = c.unitId;
    }

    const lotCode = p.tracksLots ? get('lotCode') : '';
    const expiry = p.tracksLots ? parseDate(raw('expiryDate')) : null;
    if (expiry === undefined) return err('Data de validade inválida');

    lines.push({
      row,
      productId: p.id,
      code: p.code,
      name: p.name,
      qty,
      unitId,
      unitPrice: Math.round(unitPrice),
      lotCode,
      expiryDate: expiry ?? '',
    });
  });

  return { lines, errors };
}
