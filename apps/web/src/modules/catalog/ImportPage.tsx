import { useState } from 'react';
import { buttonCls, ErrorBox, secondaryCls, tableCls, tdCls, thCls } from '../../components/ui';
import { t } from '../../i18n';
import { apiDownload, apiUpload } from '../../lib/api';

type Result = {
  total: number;
  create: number;
  update: number;
  errors: { row: number; message: string }[];
  applied: boolean;
};

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setResult(await apiUpload<Result>(`/products/import?dryRun=${dryRun}`, file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-slate-600">{t('import.intro')}</p>
      <button
        className={secondaryCls}
        onClick={() =>
          apiDownload('/products/import/template', 'modelo-produtos.xlsx').catch((e: Error) =>
            setError(e.message),
          )
        }
      >
        {t('import.template')}
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx"
          className="text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
        />
        <button className={secondaryCls} disabled={!file || busy} onClick={() => run(true)}>
          {t('import.preview')}
        </button>
        <button
          className={buttonCls}
          disabled={!file || busy || !result || result.applied || result.errors.length > 0}
          onClick={() => run(false)}
        >
          {t('import.apply')}
        </button>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {result && (
        <div className="space-y-3 rounded-xl border bg-white shadow-xs p-4 text-sm">
          {result.applied ? (
            <p className="text-emerald-700">
              {t('import.done', { create: result.create, update: result.update })}
            </p>
          ) : (
            <p>
              {t('import.summary', {
                total: result.total,
                create: result.create,
                update: result.update,
              })}
            </p>
          )}
          {result.errors.length > 0 && (
            <>
              <h3 className="font-medium text-red-700">{t('import.errors')}</h3>
              <table className={tableCls}>
                <thead className="bg-slate-100">
                  <tr>
                    <th className={thCls}>{t('import.row')}</th>
                    <th className={thCls} />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.errors.map((e) => (
                    <tr key={e.row}>
                      <td className={tdCls}>{e.row}</td>
                      <td className={tdCls}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
