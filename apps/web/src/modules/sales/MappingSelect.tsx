import { inputCls } from '../../components/ui';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import type { SaleItemRow } from '../recipes/types';

const IGNORE = '__ignore__';

/** Escolha do artigo de venda para um código POS (guarda logo ao mudar). */
export function MappingSelect(props: {
  posName: string;
  posCode: string;
  posLabel: string | null;
  current: { saleItemId: string | null; ignore: boolean } | null;
  saleItems: SaleItemRow[];
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const value = props.current?.ignore ? IGNORE : (props.current?.saleItemId ?? '');
  const change = async (v: string) => {
    try {
      await api('/pos-mappings', {
        method: 'PUT',
        body: {
          posName: props.posName,
          posCode: props.posCode,
          posLabel: props.posLabel,
          saleItemId: v && v !== IGNORE ? v : null,
          ignore: v === IGNORE,
        },
      });
      props.onSaved();
    } catch (e) {
      props.onError((e as Error).message);
    }
  };
  return (
    <select
      aria-label={`${t('sales.mapping')} ${props.posCode}`}
      className={`${inputCls} ${value ? '' : 'border-amber-400'}`}
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      <option value="">{t('sales.unmappedOption')}</option>
      <option value={IGNORE}>{t('sales.ignore')}</option>
      {props.saleItems
        .filter((i) => !i.isSubRecipe && i.active)
        .map((i) => (
          <option key={i.id} value={i.id}>
            {i.code} · {i.name}
          </option>
        ))}
    </select>
  );
}
