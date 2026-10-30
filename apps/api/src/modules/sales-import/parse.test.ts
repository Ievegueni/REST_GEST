import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseDate, parseNumber, parseSalesFile } from './parse';

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
