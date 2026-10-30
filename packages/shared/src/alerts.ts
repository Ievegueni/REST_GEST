export const ALERT_TYPES = [
  'STOCK_BELOW_MIN',
  'STOCK_OUT',
  'STOCK_ABOVE_MAX',
  'EXPIRY_NEAR',
  'INVENTORY_VARIANCE',
  'POS_UNMAPPED',
  'SALES_IMPORT_MISSING',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Valores iniciais de cada regra (o tenant altera em Definições → Alertas). */
export const ALERT_DEFAULTS: Record<
  AlertType,
  { enabled: boolean; sms: boolean; threshold: number | null }
> = {
  STOCK_BELOW_MIN: { enabled: true, sms: true, threshold: null },
  STOCK_OUT: { enabled: true, sms: true, threshold: null },
  STOCK_ABOVE_MAX: { enabled: true, sms: false, threshold: null },
  EXPIRY_NEAR: { enabled: true, sms: true, threshold: 7 }, // dias
  INVENTORY_VARIANCE: { enabled: true, sms: true, threshold: 5 }, // %
  POS_UNMAPPED: { enabled: true, sms: false, threshold: null },
  SALES_IMPORT_MISSING: { enabled: true, sms: false, threshold: null },
};

/** Perfis base destinatários por defeito (Administrador + Gerente da unidade + Ecónomo). */
export const DEFAULT_ALERT_ROLES = ['Administrador', 'Gerente', 'Ecónomo'];
