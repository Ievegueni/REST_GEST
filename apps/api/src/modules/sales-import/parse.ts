/** Leitura de ficheiros de vendas do POS segundo um perfil de importação (função pura). */
import ExcelJS from 'exceljs';

export const MAX_ROWS = 50_000;
export const FIELDS = ['itemCode', 'itemName', 'qty', 'amount', 'date'] as const;
export type Field = (typeof FIELDS)[number];
export const REQUIRED_FIELDS: Field[] = ['itemCode', 'qty'];

export type ProfileConfig = {
  sheetName: string | null;
  headerRow: number;
  columns: Partial<Record<Field, string>>;
  dateFormat: string;
  decimalSeparator: string;
};

export type ParsedRow = {
  row: number;
  posCode: string;
  posLabel: string | null;
  qty: number;
  amount: number;
  saleDate: string;
};
export type ParseResult = { rows: ParsedRow[]; errors: { row: number; message: string }[] };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function text(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v)
      return v.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) return text(v.result as ExcelJS.CellValue);
    return '';
  }
  return String(v).trim();
}

export function parseNumber(v: ExcelJS.CellValue, decimalSeparator: string): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in v)
    return parseNumber(v.result as ExcelJS.CellValue, decimalSeparator);
  let s = text(v).replace(/\s|kz|aoa/gi, '');
  if (!s) return null;
  s = decimalSeparator === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Data → "YYYY-MM-DD". Aceita Date do Excel, número de série e texto no formato do perfil. */
export function parseDate(v: ExcelJS.CellValue, format: string): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number')
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = text(v);
  const parts = s.match(/\d+/g);
  if (!parts || parts.length < 3) return null;
  const order = format.toUpperCase().match(/YYYY|MM|DD/g) ?? ['DD', 'MM', 'YYYY'];
  const get = (k: string) => Number(parts[order.indexOf(k)]);
  const [y, m, d] = [get('YYYY'), get('MM'), get('DD')];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return date.toISOString().slice(0, 10);
}

/** `fallbackDate` é usado quando o perfil não tem coluna de data (ficheiro de um só dia). */
export async function parseSalesFile(
  file: Buffer,
  cfg: ProfileConfig,
  fallbackDate: string | null,
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new Error('Ficheiro Excel inválido (.xlsx)');
  }
  const ws = cfg.sheetName ? wb.getWorksheet(cfg.sheetName) : wb.worksheets[0];
  if (!ws)
    throw new Error(
      cfg.sheetName ? `Folha "${cfg.sheetName}" não encontrada` : 'Ficheiro sem folhas',
    );
  if (ws.actualRowCount > MAX_ROWS) throw new Error(`Máximo de ${MAX_ROWS} linhas`);

  const index: Partial<Record<Field, number>> = {};
  ws.getRow(cfg.headerRow).eachCell((cell, i) => {
    const h = norm(text(cell.value));
    for (const f of FIELDS) if (cfg.columns[f] && norm(cfg.columns[f]!) === h) index[f] = i;
  });
  const missing = FIELDS.filter((f) => cfg.columns[f] && !index[f]).map((f) => cfg.columns[f]);
  if (missing.length) throw new Error(`Colunas não encontradas: ${missing.join(', ')}`);
  if (!index.date && !fallbackDate)
    throw new Error('O perfil não tem coluna de data: indique a data das vendas');

  const rows: ParsedRow[] = [];
  const errors: ParseResult['errors'] = [];
  ws.eachRow((r, n) => {
    if (n <= cfg.headerRow) return;
    const cell = (f: Field) => (index[f] ? r.getCell(index[f]!).value : null);
    const posCode = text(cell('itemCode'));
    if (!posCode) return; // linhas vazias, subtotais e totais sem código
    const qty = parseNumber(cell('qty'), cfg.decimalSeparator);
    const amount = index.amount ? parseNumber(cell('amount'), cfg.decimalSeparator) : 0;
    const saleDate = index.date ? parseDate(cell('date'), cfg.dateFormat) : fallbackDate;
    if (qty == null)
      return void errors.push({ row: n, message: `Quantidade inválida (${posCode})` });
    if (amount == null) return void errors.push({ row: n, message: `Valor inválido (${posCode})` });
    if (!saleDate) return void errors.push({ row: n, message: `Data inválida (${posCode})` });
    if (qty === 0) return;
    rows.push({
      row: n,
      posCode,
      posLabel: text(cell('itemName')) || null,
      qty,
      amount: Math.round(amount),
      saleDate,
    });
  });
  return { rows, errors };
}
