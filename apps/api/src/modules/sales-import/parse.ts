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
  /** null = o mesmo que `decimalSeparator` */
  amountDecimalSeparator?: string | null;
  /** relatório com secções: lê só a secção com este título, até à linha "Total" */
  section?: string | null;
  /** secção que lista os grupos/famílias: essas linhas são subtotais e são ignoradas */
  groupSection?: string | null;
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

/** CSV (RFC 4180: aspas, campos multilinha). Separador `,` ou `;`, o mais frequente no início. */
export function parseCsv(input: string): string[][] {
  const src = input.replace(/^\uFEFF/, '');
  const head = src.slice(0, 4096); // a 1.ª linha pode ser só um título
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  if (field || row.length) endRow();
  return rows;
}

type Grid = ExcelJS.CellValue[][]; // grid[n] = linha n (1-based), grid[n][i] = coluna i (1-based)

async function loadGrid(file: Buffer, cfg: ProfileConfig, csv: boolean): Promise<Grid> {
  if (csv) return [[], ...parseCsv(file.toString('utf8')).map((r) => [null, ...r])];
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
  const grid: Grid = [];
  ws.eachRow((r, n) => void (grid[n] = r.values as ExcelJS.CellValue[]));
  return grid;
}

/** `fallbackDate` é usado quando o perfil não tem coluna de data (ficheiro de um só dia);
 *  sem ela, procura-se uma data nas linhas acima do cabeçalho (ex.: "[ 2026-11-03 ]"). */
export async function parseSalesFile(
  file: Buffer,
  cfg: ProfileConfig,
  fallbackDate: string | null,
  csv = false,
): Promise<ParseResult> {
  const grid = await loadGrid(file, cfg, csv);
  if (grid.length > MAX_ROWS + 1) throw new Error(`Máximo de ${MAX_ROWS} linhas`);
  const cellsOf = (n: number) => grid[n] ?? [];
  const findRow = (from: number, test: (h: string) => boolean) => {
    for (let n = from; n < grid.length; n++)
      if (cellsOf(n).some((c) => test(norm(text(c))))) return n;
    return 0;
  };
  const codeHeader = norm(cfg.columns.itemCode ?? '');
  /** Linha de cabeçalho da secção com este título (0 = não encontrada). */
  const sectionHeader = (title: string) => {
    const at = findRow(1, (h) => h === norm(title));
    return at ? findRow(at + 1, (h) => h === codeHeader) : 0;
  };

  let headerRow = cfg.headerRow;
  if (cfg.section) {
    headerRow = sectionHeader(cfg.section);
    if (!headerRow) throw new Error(`Secção "${cfg.section}" não encontrada`);
  }

  const index: Partial<Record<Field, number>> = {};
  cellsOf(headerRow).forEach((cell, i) => {
    const h = norm(text(cell));
    for (const f of FIELDS) if (cfg.columns[f] && norm(cfg.columns[f]!) === h) index[f] = i;
  });
  const missing = FIELDS.filter((f) => cfg.columns[f] && !index[f]).map((f) => cfg.columns[f]);
  if (missing.length) throw new Error(`Colunas não encontradas: ${missing.join(', ')}`);

  /** Linhas da secção: do cabeçalho até "Total" (relatórios) ou até ao fim (tabela). */
  function* sectionRows(header: number, untilTotal: boolean) {
    for (let n = header + 1; n < grid.length; n++) {
      const code = text(cellsOf(n)[index.itemCode!] ?? null);
      if (untilTotal && norm(code) === 'total') return;
      yield { n, code };
    }
  }

  const groups = new Set<string>();
  if (cfg.groupSection) {
    const h = sectionHeader(cfg.groupSection);
    if (!h) throw new Error(`Secção "${cfg.groupSection}" não encontrada`);
    for (const { code } of sectionRows(h, true)) if (code) groups.add(norm(code));
  }

  let fileDate: string | null = null;
  if (!index.date && !fallbackDate)
    for (let n = 1; n < headerRow && !fileDate; n++)
      for (const c of cellsOf(n)) {
        // números soltos (NIF, código postal) não são datas: só texto ou células de data
        fileDate = parseDate(c instanceof Date ? c : text(c ?? null), cfg.dateFormat);
        if (fileDate) break;
      }
  const defaultDate = fallbackDate ?? fileDate;
  if (!index.date && !defaultDate)
    throw new Error('O perfil não tem coluna de data: indique a data das vendas');

  const amountSep = cfg.amountDecimalSeparator || cfg.decimalSeparator;
  const rows: ParsedRow[] = [];
  const errors: ParseResult['errors'] = [];
  for (const { n, code: posCode } of sectionRows(headerRow, !!cfg.section)) {
    if (!posCode || groups.has(norm(posCode))) continue; // vazias, subtotais e totais sem código
    const cell = (f: Field) => (index[f] ? (cellsOf(n)[index[f]!] ?? null) : null);
    const qty = parseNumber(cell('qty'), cfg.decimalSeparator);
    const amount = index.amount ? parseNumber(cell('amount'), amountSep) : 0;
    const saleDate = index.date ? parseDate(cell('date'), cfg.dateFormat) : defaultDate;
    if (qty == null) {
      errors.push({ row: n, message: `Quantidade inválida (${posCode})` });
      continue;
    }
    if (amount == null) {
      errors.push({ row: n, message: `Valor inválido (${posCode})` });
      continue;
    }
    if (!saleDate) {
      errors.push({ row: n, message: `Data inválida (${posCode})` });
      continue;
    }
    if (qty === 0) continue;
    rows.push({
      row: n,
      posCode,
      posLabel: text(cell('itemName')) || null,
      qty,
      amount: Math.round(amount),
      saleDate,
    });
  }
  return { rows, errors };
}
