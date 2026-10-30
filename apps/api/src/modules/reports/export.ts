/** Exportação genérica de relatórios para Excel (exceljs) e PDF (pdfmake, fontes standard). */
import ExcelJS from 'exceljs';
import pdfmake from 'pdfmake';
import type { Column, Report, Row } from './common';

const FONT = {
  normal: 'Helvetica',
  bold: 'Helvetica-Bold',
  italics: 'Helvetica-Oblique',
  bolditalics: 'Helvetica-BoldOblique',
};
pdfmake.setFonts({ Helvetica: FONT });
// Relatórios só com dados internos: proíbe URLs e ficheiros locais, excepto as fontes standard do PDF.
const STANDARD_FONTS = new Set(Object.values(FONT));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path: string) => STANDARD_FONTS.has(path));

const NUM_FMT: Partial<Record<Column['type'], string>> = {
  int: '#,##0',
  qty: '#,##0.###',
  money: '#,##0 "Kz"',
  cost: '#,##0.00 "Kz"',
  pct: '0.0"%"',
};

export async function toXlsx(r: Report, subtitle: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(r.title.slice(0, 31));
  ws.addRow([r.title]).font = { bold: true, size: 14 };
  ws.addRow([subtitle]);
  ws.addRow([]);
  ws.addRow(r.columns.map((c) => c.label)).font = { bold: true };
  const put = (row: Row, bold = false) => {
    const x = ws.addRow(
      r.columns.map((c) =>
        c.type === 'date' && row[c.key] ? new Date(String(row[c.key])) : row[c.key],
      ),
    );
    if (bold) x.font = { bold: true };
  };
  r.rows.forEach((row) => put(row));
  if (r.totals) put(r.totals, true);
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.type === 'text' ? 30 : 16;
    if (NUM_FMT[c.type]) col.numFmt = NUM_FMT[c.type]!;
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
  });
  if (r.notes) ws.addRow([]).getCell(1).value = r.notes;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const nf = (d: number) =>
  new Intl.NumberFormat('pt-AO', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export function formatCell(c: Column, v: Row[string] | undefined): string {
  if (v == null || v === '') return '';
  if (typeof v !== 'number')
    return c.type === 'date' ? String(v).slice(0, 10).split('-').reverse().join('/') : String(v);
  switch (c.type) {
    case 'money':
      return `${nf(0).format(v)} Kz`;
    case 'cost':
      return `${nf(2).format(v)} Kz`;
    case 'pct':
      return `${nf(1).format(v)}%`;
    case 'qty':
      return nf(3).format(v);
    default:
      return nf(0).format(v);
  }
}

export async function toPdf(r: Report, subtitle: string, tenantName: string) {
  const numeric = (c: Column) => c.type !== 'text' && c.type !== 'date';
  const cell = (c: Column, v: Row[string] | undefined, bold = false) => ({
    text: formatCell(c, v),
    alignment: numeric(c) ? 'right' : 'left',
    bold,
  });
  const body = [
    r.columns.map((c) => ({
      text: c.label,
      bold: true,
      alignment: numeric(c) ? 'right' : 'left',
      fillColor: '#eeeeee',
    })),
    ...r.rows.map((row) => r.columns.map((c) => cell(c, row[c.key]))),
    ...(r.totals ? [r.columns.map((c) => cell(c, r.totals![c.key], true))] : []),
  ];
  const doc = pdfmake.createPdf({
    pageSize: 'A4',
    pageOrientation: r.columns.length > 6 ? 'landscape' : 'portrait',
    pageMargins: [30, 40, 30, 40],
    defaultStyle: { font: 'Helvetica', fontSize: 8 },
    header: { text: tenantName, margin: [30, 15, 30, 0], fontSize: 8, color: '#666666' },
    footer: (page: number, pages: number) => ({
      text: `${page} / ${pages}`,
      alignment: 'right',
      margin: [30, 10],
      fontSize: 8,
      color: '#666666',
    }),
    content: [
      { text: r.title, fontSize: 14, bold: true },
      { text: subtitle, margin: [0, 2, 0, 10], color: '#444444' },
      {
        table: {
          headerRows: 1,
          widths: r.columns.map((c) => (c.type === 'text' ? '*' : 'auto')),
          body,
        },
        layout: 'lightHorizontalLines',
      },
      ...(r.notes
        ? [{ text: r.notes, margin: [0, 10, 0, 0], italics: true, color: '#666666' }]
        : []),
    ],
  } as never);
  return Buffer.from(await doc.getBuffer());
}
