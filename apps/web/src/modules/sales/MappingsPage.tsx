import { useState } from 'react';
import { ErrorBox, tableCls, tdCls, thCls } from '../../components/ui';
import { t } from '../../i18n';
import { useApi } from '../../lib/useApi';
import type { SaleItemRow } from '../recipes/types';
import { MappingSelect } from './MappingSelect';
import type { Mapping } from './types';

export function MappingsPage() {
  const { data, error: loadError, reload } = useApi<Mapping[]>('/pos-mappings');
  const { data: saleItems } = useApi<SaleItemRow[]>('/sale-items');
  const [error, setError] = useState('');
  return (
    <div className="space-y-4">
      <ErrorBox>{error || loadError}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('sales.posName')}</th>
            <th className={thCls}>{t('sales.posCode')}</th>
            <th className={thCls}>{t('sales.posLabel')}</th>
            <th className={thCls}>{t('sales.mapping')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((m) => (
            <tr key={m.id}>
              <td className={tdCls}>{m.posName}</td>
              <td className={`${tdCls} font-mono`}>{m.posCode}</td>
              <td className={tdCls}>{m.posLabel}</td>
              <td className={`${tdCls} w-72`}>
                {saleItems && (
                  <MappingSelect
                    posName={m.posName}
                    posCode={m.posCode}
                    posLabel={m.posLabel}
                    current={{ saleItemId: m.saleItem?.id ?? null, ignore: m.ignore }}
                    saleItems={saleItems}
                    onSaved={reload}
                    onError={setError}
                  />
                )}
              </td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={4}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
