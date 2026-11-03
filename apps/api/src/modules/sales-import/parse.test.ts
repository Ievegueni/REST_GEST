import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseCsv, parseDate, parseNumber, parseSalesFile } from './parse';

describe('parseNumber', () => {
  it('respeita o separador decimal', () => {
    expect(parseNumber('1.234,50', ',')).toBe(1234.5);
    expect(parseNumber('1,234.50', '.')).toBe(1234.5);
    expect(parseNumber('2 500 Kz', ',')).toBe(2500);
    expect(parseNumber(3, ',')).toBe(3);
    expect(parseNumber('abc', ',')).toBeNull();
  });
});

describe('parseDate', () => {
  it('lê texto no formato do perfil e valida datas impossíveis', () => {
    expect(parseDate('31/10/2026', 'DD/MM/YYYY')).toBe('2026-10-31');
    expect(parseDate('2026-10-31 23:10', 'YYYY-MM-DD')).toBe('2026-10-31');
    expect(parseDate('10/31/2026', 'MM/DD/YYYY')).toBe('2026-10-31');
    expect(parseDate('31/02/2026', 'DD/MM/YYYY')).toBeNull();
  });
  it('lê datas Excel (Date e número de série)', () => {
    expect(parseDate(new Date(Date.UTC(2026, 9, 31)), 'DD/MM/YYYY')).toBe('2026-10-31');
    expect(parseDate(46326, 'DD/MM/YYYY')).toBe('2026-10-31');
  });
});

describe('parseSalesFile', () => {
  it('encontra colunas pelo cabeçalho, salta totais e reporta linhas inválidas', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Vendas');
    ws.addRow(['Relatório de vendas']);
    ws.addRow([]);
    ws.addRow(['Data', 'Qtd.', 'Artigo', 'Descrição', 'Total']);
    ws.addRow(['30/10/2026', '2', 'A1', 'Cerveja', '1.000,00']);
    ws.addRow(['30/10/2026', 'x', 'A2', 'Água', '500']);
    ws.addRow(['', '10', '', 'TOTAL', '9.999']);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await parseSalesFile(
      file,
      {
        sheetName: null,
        headerRow: 3,
        columns: {
          itemCode: 'Artigo',
          itemName: 'Descrição',
          qty: 'Qtd.',
          amount: 'total',
          date: 'Data',
        },
        dateFormat: 'DD/MM/YYYY',
        decimalSeparator: ',',
      },
      null,
    );
    expect(r.rows).toEqual([
      { row: 4, posCode: 'A1', posLabel: 'Cerveja', qty: 2, amount: 1000, saleDate: '2026-10-30' },
    ]);
    expect(r.errors).toEqual([{ row: 5, message: 'Quantidade inválida (A2)' }]);
  });

  it('sem coluna de data exige a data das vendas', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('V').addRow(['Cod', 'Q']);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const cfg = {
      sheetName: null,
      headerRow: 1,
      columns: { itemCode: 'Cod', qty: 'Q' },
      dateFormat: 'DD/MM/YYYY',
      decimalSeparator: ',',
    };
    await expect(parseSalesFile(file, cfg, null)).rejects.toThrow('data das vendas');
    await expect(
      parseSalesFile(file, { ...cfg, columns: { itemCode: 'X', qty: 'Q' } }, '2026-10-30'),
    ).rejects.toThrow('Colunas não encontradas: X');
  });
});

describe('relatório CSV com secções', () => {
  const q = (...c: string[]) => c.map((v) => `"${v}"`).join(',');
  const head = q('', '', 'Descrição', 'Quantidade', 'Total', 'Total c/IVA');
  const csv = [
    '"Vendas artigos"',
    '"Empresa X, Lda 1\r\nNº  de contribuinte: 500000000"',
    '"[ 2026-11-03 ]"',
    q('', '', 'Vendas por Artigo', '', '', ''),
    head,
    q('', '', 'Aguas', '3.00', '5.514Kz', '5.900Kz'),
    q('', '', 'Agua 1l', '1.00', '2.757Kz', '2.950Kz'),
    q('', '', 'Agua 1l', '2.00', '5.514Kz', '5.900Kz'),
    q('', '', 'Acompanhamentos', '1.00', '0Kz', '0Kz'),
    q('', '', 'Couve ', '1.00', '0Kz', '0Kz'),
    q('', '', 'Total', '4.00', '5.514Kz', '5.900Kz'),
    q('', '', 'Vendas por local', '', '', ''),
    head,
    q('', '', 'Agua 1l', '3.00', '8.271Kz', '8.850Kz'),
    q('', '', 'Total', '3.00', '8.271Kz', '8.850Kz'),
    q('', '', 'Resumo por família\n', '', '', ''),
    head,
    q('', '', 'Aguas', '3.00', '5.514Kz', '5.900Kz'),
    q('', '', 'Acompanhamentos', '1.00', '0Kz', '0Kz'),
    q('', '', 'Total', '4.00', '5.514Kz', '5.900Kz'),
    '"Apuramento impresso em 2026-11-04 às 14:38:43"',
  ].join('\r\n');
  const cfg = {
    sheetName: null,
    headerRow: 1,
    columns: { itemCode: 'Descrição', qty: 'Quantidade', amount: 'Total' },
    dateFormat: 'YYYY-MM-DD',
    decimalSeparator: '.',
    amountDecimalSeparator: ',',
    section: 'Vendas por Artigo',
    groupSection: 'Resumo por família',
  };

  it('parseCsv trata aspas, campos multilinha e ;', () => {
    expect(parseCsv('a;"b;""c"""\r\n"x\ny";2')).toEqual([
      ['a', 'b;"c"'],
      ['x\ny', '2'],
    ]);
  });

  it('lê só a secção de artigos, ignora famílias e usa a data do cabeçalho', async () => {
    const r = await parseSalesFile(Buffer.from('\uFEFF' + csv), cfg, null, true);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.posCode, x.qty, x.amount, x.saleDate])).toEqual([
      ['Agua 1l', 1, 2757, '2026-11-03'],
      ['Agua 1l', 2, 5514, '2026-11-03'],
      ['Couve', 1, 0, '2026-11-03'],
    ]);
    // a data indicada no upload prevalece sobre a do ficheiro
    const r2 = await parseSalesFile(Buffer.from(csv), cfg, '2026-11-02', true);
    expect(r2.rows[0]!.saleDate).toBe('2026-11-02');
    await expect(
      parseSalesFile(Buffer.from(csv), { ...cfg, section: 'Vendas por mesa' }, null, true),
    ).rejects.toThrow('Secção "Vendas por mesa" não encontrada');
  });
});
