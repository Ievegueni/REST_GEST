export type SaleItemRow = {
  id: string;
  code: string;
  name: string;
  salePrice: number | null;
  isSubRecipe: boolean;
  yieldQty: string;
  yieldUnit: string | null;
  active: boolean;
  lineCount: number;
  cost: number | null;
  margin: number | null;
  marginPct: number | null;
  error: string | null;
};

export type SaleItem = Omit<
  SaleItemRow,
  'lineCount' | 'cost' | 'margin' | 'marginPct' | 'error'
> & {
  lines: {
    id: string;
    productId: string | null;
    subRecipeId: string | null;
    unitId: string | null;
    qty: string;
    lossPct: string;
    product: { id: string; code: string; name: string; stockUnit: { symbol: string } } | null;
    subRecipe: { id: string; code: string; name: string; yieldUnit: string | null } | null;
  }[];
  breakdown: {
    parts: { productId: string; qty: string; unitCost: string; cost: string }[];
    total: string;
  } | null;
};
