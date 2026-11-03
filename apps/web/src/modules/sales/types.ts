export type ImportStatus = 'PROCESSING' | 'READY' | 'FAILED' | 'CONFIRMED' | 'CANCELLED';
export type Profile = {
  id: string;
  name: string;
  posName: string;
  sheetName: string | null;
  headerRow: number;
  columns: { itemCode: string; itemName?: string; qty: string; amount?: string; date?: string };
  dateFormat: string;
  decimalSeparator: string;
  amountDecimalSeparator: string | null;
  section: string | null;
  groupSection: string | null;
  active: boolean;
};
export type ImportRow = {
  id: string;
  number: number;
  status: ImportStatus;
  fileName: string;
  createdAt: string;
  periodFrom: string | null;
  periodTo: string | null;
  rowCount: number;
  totalAmount: number;
  unit: { name: string };
  profile: { name: string };
};
type Ref = { id: string; code: string; name: string };
export type Import = Omit<ImportRow, 'profile'> & {
  fileUrl: string | null;
  errors: { row: number; message: string }[] | null;
  profile: { id: string; name: string; posName: string };
  items: {
    posCode: string;
    posLabel: string | null;
    qty: string;
    amount: number;
    lines: number;
    pendingLines: number;
    mapping: { saleItem: Ref | null; ignore: boolean } | null;
  }[];
  unmapped: number;
  pendingLines: number;
  missingLocations: string[];
};
export type Mapping = {
  id: string;
  posName: string;
  posCode: string;
  posLabel: string | null;
  ignore: boolean;
  saleItem: Ref | null;
};
