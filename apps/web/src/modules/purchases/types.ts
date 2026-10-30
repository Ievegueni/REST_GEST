export type OrderStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
type Ref = { id: string; code: string; name: string };

export type OrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  createdAt: string;
  expectedDate: string | null;
  supplier: { name: string };
  unit: { name: string };
  _count: { lines: number };
};
export type Order = {
  id: string;
  number: number;
  status: OrderStatus;
  supplierId: string;
  unitId: string;
  expectedDate: string | null;
  notes: string | null;
  supplier: { id: string; name: string };
  unit: { id: string; name: string };
  lines: {
    id: string;
    productId: string;
    unitId: string;
    qty: string;
    unitPrice: number | null;
    receivedQty: string;
    product: Ref;
    unit: { id: string; symbol: string };
  }[];
  receipts: {
    id: string;
    number: number;
    status: 'POSTED' | 'CANCELLED';
    receivedAt: string;
    totalAmount: number;
  }[];
};
export type ReceiptRow = {
  id: string;
  number: number;
  status: 'POSTED' | 'CANCELLED';
  receivedAt: string;
  invoiceNumber: string | null;
  totalAmount: number;
  supplier: { name: string };
  location: { name: string; unit: { name: string } };
  order: { number: number } | null;
};
export type Receipt = ReceiptRow & {
  invoiceDate: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  notes: string | null;
  order: { id: string; number: number } | null;
  lines: {
    id: string;
    qty: string;
    unitPrice: number;
    total: number;
    lotCode: string | null;
    expiryDate: string | null;
    product: Ref;
    unit: { symbol: string };
  }[];
};
