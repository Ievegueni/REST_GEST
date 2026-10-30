/** Catálogo de permissões `modulo.accao`. Perfis = conjuntos destas permissões. */
export const PERMISSIONS = [
  'settings.manage',
  'users.manage',
  'units.manage',
  'catalog.view',
  'catalog.manage',
  'stock.view',
  'stock.move',
  'stock.adjust',
  'purchases.manage',
  'transfers.manage',
  'inventory.count',
  'inventory.close',
  'recipes.manage',
  'sales.import',
  'reports.view',
  'alerts.manage',
  'hr.view',
  'hr.manage',
  'hr.sensitive',
  'payroll.process',
  'payroll.approve',
  'costs.manage',
  'cash.close',
  'cash.validate',
  'payables.manage',
  'financial.view',
  'ai.use',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;
const STOCK_OPS: Permission[] = [
  'catalog.view',
  'stock.view',
  'stock.move',
  'stock.adjust',
  'purchases.manage',
  'transfers.manage',
  'inventory.count',
  'inventory.close',
];

/** Perfis base criados em cada tenant. O tenant pode criar perfis personalizados. */
export const BASE_ROLES: Record<string, readonly Permission[]> = {
  Administrador: ALL,
  // Gerente não vê dados sensíveis de funcionários (salário, IBAN, documentos): só o perfil RH.
  Gerente: ALL.filter(
    (p) => !['settings.manage', 'users.manage', 'units.manage', 'hr.sensitive'].includes(p),
  ),
  Ecónomo: STOCK_OPS,
  Caixa: ['cash.close'],
  RH: ['hr.view', 'hr.manage', 'hr.sensitive', 'payroll.process'],
  Consulta: ['catalog.view', 'stock.view', 'reports.view'],
};
