import type { FieldDef } from '../../components/FormDrawer';
import { t } from '../../i18n';

export const supplierFields: FieldDef[] = [
  { key: 'name', label: t('supplier.name'), required: true },
  { key: 'nif', label: t('supplier.nif') },
  { key: 'contactName', label: t('supplier.contactName') },
  { key: 'phone', label: t('supplier.phone') },
  { key: 'email', label: t('supplier.email'), type: 'email' },
  { key: 'address', label: t('supplier.address') },
  { key: 'paymentTermDays', label: t('supplier.paymentTermDays'), type: 'number', required: true },
  { key: 'notes', label: t('supplier.notes'), type: 'textarea' },
  { key: 'active', label: t('common.active'), type: 'checkbox' },
];
