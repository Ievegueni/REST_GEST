import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmButton } from '../../components/ConfirmButton';
import { buttonCls, ErrorBox, secondaryCls, tableCls, tdCls, thCls } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { SaleItemRow } from '../recipes/types';
import { MappingSelect } from './MappingSelect';
import type { Import } from './types';

export function SalesImportPage() {
  const { id } = useParams<{ id: string }>();
  const { data: imp, error: loadError, reload } = useApi<Import>(`/sales-imports/${id}`);
  const { data: saleItems } = useApi<SaleItemRow[]>('/sale-items');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Enquanto o job lê o ficheiro, volta a perguntar a cada 2 s.
  const processing = imp?.status === 'PROCESSING';
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(reload, 2000);
    return () => clearInterval(timer);
  }, [processing, reload]);

  if (loadError) return <ErrorBox>{loadError}</ErrorBox>;
  if (!imp) return <p className="text-slate-500">{t('common.loading')}</p>;

  const act = async (action: 'confirm' | 'post-pending' | 'cancel') => {
    setBusy(true);
    setError('');
    try {
      await api(`/sales-imports/${imp.id}/${action}`, { method: 'POST' });
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const editable = imp.status === 'READY' || imp.status === 'CONFIRMED';
  const parseErrors = imp.status !== 'FAILED' ? (imp.errors ?? []) : [];

  return (
    <div className="max-w-6xl space-y-4">
      <Link to="/vendas" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {t('sales.import', { n: imp.number })}
        <span className="ml-2 text-sm text-slate-500">
          ({t(`importStatus.${imp.status}` as TKey)})
        </span>
      </h2>
      <p className="text-sm text-slate-600">
        {imp.unit.name} · {imp.profile.name} · {imp.fileName}
        {imp.periodFrom && ` · ${formatDate(imp.periodFrom)} – ${formatDate(imp.periodTo)}`}
        {imp.rowCount > 0 &&
          ` · ${imp.rowCount} ${t('sales.rows').toLowerCase()} · ${formatMoney(imp.totalAmount)}`}
      </p>

      {processing && <p className="text-slate-500">{t('sales.processing')}</p>}
      {imp.status === 'FAILED' && (
        <ErrorBox>{imp.errors?.map((e) => e.message).join(' · ')}</ErrorBox>
      )}
      {editable && imp.missingLocations.length > 0 && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('sales.missingLocations', { list: imp.missingLocations.join(', ') })}{' '}
          <Link to="/fichas/locais" className="underline">
            {t('recipes.outputLocations')}
          </Link>
        </p>
      )}
      {editable && imp.unmapped > 0 && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('sales.unmapped', { n: imp.unmapped })}
        </p>
      )}

      {imp.items.length > 0 && (
        <table className={tableCls}>
          <thead className="bg-slate-100">
            <tr>
              <th className={thCls}>{t('sales.posCode')}</th>
              <th className={thCls}>{t('sales.posLabel')}</th>
              <th className={`${thCls} text-right`}>{t('stock.qty')}</th>
              <th className={`${thCls} text-right`}>{t('sales.amount')}</th>
              <th className={thCls}>{t('sales.mapping')}</th>
              {imp.status === 'CONFIRMED' && (
                <th className={`${thCls} text-right`}>{t('sales.pending')}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {imp.items.map((i) => (
              <tr key={i.posCode}>
                <td className={`${tdCls} font-mono`}>{i.posCode}</td>
                <td className={tdCls}>{i.posLabel}</td>
                <td className={`${tdCls} text-right`}>{formatQty(i.qty)}</td>
                <td className={`${tdCls} text-right`}>{formatMoney(i.amount)}</td>
                <td className={`${tdCls} w-72`}>
                  {editable && saleItems ? (
                    <MappingSelect
                      posName={imp.profile.posName}
                      posCode={i.posCode}
                      posLabel={i.posLabel}
                      current={
                        i.mapping && {
                          saleItemId: i.mapping.saleItem?.id ?? null,
                          ignore: i.mapping.ignore,
                        }
                      }
                      saleItems={saleItems}
                      onSaved={reload}
                      onError={setError}
                    />
                  ) : i.mapping?.ignore ? (
                    t('sales.ignore')
                  ) : (
                    (i.mapping?.saleItem?.name ?? '—')
                  )}
                </td>
                {imp.status === 'CONFIRMED' && (
                  <td className={`${tdCls} text-right ${i.pendingLines ? 'text-amber-700' : ''}`}>
                    {i.pendingLines}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {parseErrors.length > 0 && (
        <details className="rounded border bg-white p-3 text-sm">
          <summary className="cursor-pointer text-red-700">
            {t('sales.parseErrors')} ({parseErrors.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {parseErrors.map((e) => (
              <li key={e.row}>
                {t('import.row')} {e.row}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap gap-2">
        {imp.status === 'READY' && (
          <button className={buttonCls} disabled={busy} onClick={() => act('confirm')}>
            {t('sales.confirm')}
          </button>
        )}
        {imp.status === 'CONFIRMED' && imp.pendingLines > 0 && (
          <button className={buttonCls} disabled={busy} onClick={() => act('post-pending')}>
            {t('sales.postPending', { n: imp.pendingLines })}
          </button>
        )}
        {imp.status !== 'CANCELLED' && imp.status !== 'PROCESSING' && (
          <ConfirmButton className={secondaryCls} onConfirm={() => act('cancel')}>
            {t('sales.cancel')}
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
