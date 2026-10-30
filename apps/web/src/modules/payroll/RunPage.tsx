import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmButton } from '../../components/ConfirmButton';
import { buttonCls, ErrorBox, secondaryCls, tableCls, tdCls, thCls } from '../../components/ui';
import { useCan } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api, apiDownload } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Line = {
  id: string;
  employee: { id: string; number: string; name: string };
  baseSalary: number;
  allowances: number;
  overtime: number;
  absenceDeduction: number;
  gross: number;
  inssEmployee: number;
  irt: number;
  deductions: number;
  net: number;
  inssEmployer: number;
};
type Run = {
  id: string;
  unitId: string;
  year: number;
  month: number;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  totalGross: number;
  totalNet: number;
  totalCost: number;
  unit: { name: string };
  lines: Line[];
};

const COLS: [keyof Line, TKey][] = [
  ['baseSalary', 'payroll.base'],
  ['allowances', 'payroll.allowances'],
  ['overtime', 'payroll.overtime'],
  ['absenceDeduction', 'payroll.absences'],
  ['gross', 'payroll.gross'],
  ['inssEmployee', 'payroll.inss'],
  ['irt', 'payroll.irt'],
  ['deductions', 'payroll.deductions'],
  ['net', 'payroll.net'],
  ['inssEmployer', 'payroll.employerInss'],
];

export function RunPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canApprove = useCan('payroll.approve');
  const { data: r, error: loadError, reload } = useApi<Run>(`/payroll-runs/${id}`);
  const [error, setError] = useState('');
  if (loadError) return <ErrorBox>{loadError}</ErrorBox>;
  if (!r) return <p className="text-slate-500">{t('common.loading')}</p>;
  const period = `${String(r.month).padStart(2, '0')}-${r.year}`;

  const call = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/salarios" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h1 className="text-xl font-semibold">
        {t('nav.payroll')} {String(r.month).padStart(2, '0')}/{r.year} · {r.unit.name}
        <span className="ml-2 text-sm text-slate-500">({t(`payrollStatus.${r.status}`)})</span>
      </h1>
      <div className="flex flex-wrap gap-2">
        <button
          className={secondaryCls}
          onClick={() =>
            apiDownload(`/payroll-runs/${r.id}/payslips.pdf`, `recibos-${period}.pdf`).catch(
              (e: Error) => setError(e.message),
            )
          }
        >
          {t('payroll.payslips')}
        </button>
        <button
          className={secondaryCls}
          onClick={() =>
            apiDownload(`/payroll-runs/${r.id}/map.xlsx`, `mapa-salarios-${period}.xlsx`).catch(
              (e: Error) => setError(e.message),
            )
          }
        >
          {t('payroll.map')}
        </button>
        {r.status === 'DRAFT' && (
          <>
            <button
              className={secondaryCls}
              onClick={() =>
                call(() =>
                  api('/payroll-runs', {
                    body: { unitId: r.unitId, year: r.year, month: r.month },
                  }),
                )
              }
            >
              {t('payroll.reprocess')}
            </button>
            {canApprove && (
              <ConfirmButton
                className={buttonCls}
                onConfirm={() =>
                  call(() => api(`/payroll-runs/${r.id}/approve`, { method: 'POST' }))
                }
              >
                {t('payroll.approve')}
              </ConfirmButton>
            )}
            <ConfirmButton
              onConfirm={() =>
                call(async () => {
                  await api(`/payroll-runs/${r.id}`, { method: 'DELETE' });
                  navigate('/salarios');
                })
              }
            >
              {t('payroll.delete')}
            </ConfirmButton>
          </>
        )}
        {r.status === 'APPROVED' && canApprove && (
          <ConfirmButton
            className={buttonCls}
            onConfirm={() => call(() => api(`/payroll-runs/${r.id}/pay`, { method: 'POST' }))}
          >
            {t('payroll.pay')}
          </ConfirmButton>
        )}
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead className="bg-slate-100">
            <tr>
              <th className={thCls}>{t('payroll.employee')}</th>
              {COLS.map(([k, label]) => (
                <th key={k} className={`${thCls} text-right`}>
                  {t(label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.lines.map((l) => (
              <tr key={l.id}>
                <td className={`${tdCls} whitespace-nowrap`}>
                  {l.employee.number} · {l.employee.name}
                </td>
                {COLS.map(([k]) => (
                  <td
                    key={k}
                    className={`${tdCls} whitespace-nowrap text-right ${k === 'net' ? 'font-medium' : ''}`}
                  >
                    {formatMoney(l[k] as number)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-slate-50 font-medium">
              <td className={tdCls}>{t('common.total')}</td>
              {COLS.map(([k]) => (
                <td key={k} className={`${tdCls} whitespace-nowrap text-right`}>
                  {formatMoney(r.lines.reduce((s, l) => s + (l[k] as number), 0))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-600">
        {t('payroll.totalCost')}: <strong>{formatMoney(r.totalCost)}</strong>
      </p>
    </div>
  );
}
