export type LocationType = 'WAREHOUSE' | 'BAR' | 'KITCHEN' | 'COLD_ROOM' | 'OTHER';
export type StockLocation = {
  id: string;
  unitId: string;
  name: string;
  type: LocationType;
  active: boolean;
};
export type Unit = {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  locations: StockLocation[];
};
export type Category = { id: string; name: string; parentId: string | null; active: boolean };
export type MeasureUnit = { id: string; name: string; symbol: string };
export type Role = { id: string; name: string };
export type User = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  active: boolean;
  allUnits: boolean;
  lastLoginAt: string | null;
  roleId: string;
  role: { name: string };
  unitIds: string[];
};
export type ProductRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  tracksLots: boolean;
  category: { name: string };
  stockUnit: { symbol: string };
};
export type Product = {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  stockUnitId: string;
  purchaseUnitId: string | null;
  consumptionUnitId: string | null;
  tracksLots: boolean;
  reorderPoint: string | null;
  preferredSupplierId: string | null;
  active: boolean;
  conversions: { unitId: string; factor: string }[];
  locationLimits: { locationId: string; minQty: string | null; maxQty: string | null }[];
  supplierProducts: {
    supplier: { id: string; name: string };
    lastPrice: number | null;
    lastPriceAt: string | null;
  }[];
};
export type Supplier = {
  id: string;
  name: string;
  nif: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTermDays: number;
  notes: string | null;
  active: boolean;
  _count?: { products: number };
};
export type SupplierDetail = Supplier & {
  products: {
    productId: string;
    supplierCode: string | null;
    lastPrice: number | null;
    lastPriceAt: string | null;
    product: { id: string; code: string; name: string };
  }[];
};

/** Categorias em árvore achatada, com profundidade, ordenadas por caminho. */
export function categoryTree(cats: Category[]) {
  const out: (Category & { depth: number; path: string })[] = [];
  const walk = (parentId: string | null, depth: number, prefix: string) =>
    cats
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((c) => {
        const path = prefix ? `${prefix} > ${c.name}` : c.name;
        out.push({ ...c, depth, path });
        walk(c.id, depth + 1, path);
      });
  walk(null, 0, '');
  return out;
}
