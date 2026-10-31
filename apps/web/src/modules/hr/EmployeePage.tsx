import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmButton } from '../../components/ConfirmButton';
import { buttonCls, ErrorBox, inputBase, inputCls, secondaryCls } from '../../components/ui';
import { useCan, useFeature } from '../../features/session';
import { Deductions } from './Deductions';
import { t } from '../../i18n';
import { api, apiOpen, apiUpload } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Unit } from '../types';
import type { Employee, Position } from './types';

export function EmployeePage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'novo';
  const { data, error, reload } = useApi<Employee>(isNew ? null : `/employees/${id}`);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!isNew && !data) return <p className="text-slate-500">{t('common.loading')}</p>;
  return <EmployeeForm key={JSON.stringify(data)} employee={data} reload={reload} />;
}

function F({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return (
    <label className={`space-y-1 text-sm ${span ? 'md:col-span-2' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
const d10 = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

function EmployeeForm({ employee: e, reload }: { employee: Employee | null; reload: () => void }) {
  const navigate = useNavigate();
  const manage = useCan('hr.manage');
  const sensitive = useCan('hr.sensitive');
  const payrollPerm = useCan('payroll.process');
  const payrollFeature = useFeature('payroll');
  const canPayroll = payrollPerm && payrollFeature;
  const { data: units } = useApi<Unit[]>('/units');
  const { data: positions } = useApi<Position[]>('/positions');
  const year = new Date().getFullYear();
  const { data: balance } = useApi<{
    entitlement: number | null;
    used: number;
    pending: number;
    available: number | null;
  }>(e ? `/employees/${e.id}/vacation-balance?year=${year}` : null);

  const [g, setG] = useState({
    number: e?.number ?? '',
    name: e?.name ?? '',
    unitId: e?.unitId ?? '',
    positionId: e?.positionId ?? '',
    contractType: e?.contractType ?? 'PERMANENT',
    hireDate: d10(e?.hireDate),
    contractEndDate: d10(e?.contractEndDate),
    terminationDate: d10(e?.terminationDate),
    birthDate: d10(e?.birthDate),
    phone: e?.phone ?? '',
    email: e?.email ?? '',
    address: e?.address ?? '',
    vacationDaysPerYear: e?.vacationDaysPerYear?.toString() ?? '',
    active: e?.active ?? true,
  });
  const [s, setS] = useState({
    baseSalary: e?.baseSalary?.toString() ?? '',
    nif: e?.nif ?? '',
    idNumber: e?.idNumber ?? '',
    socialSecurityNo: e?.socialSecurityNo ?? '',
    bankName: e?.bankName ?? '',
    iban: e?.iban ?? '',
    allowances: e?.allowances ?? [],
  });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const setGv = (k: keyof typeof g, v: string | boolean) => setG({ ...g, [k]: v });
  const setSv = (k: keyof typeof s, v: unknown) => setS({ ...s, [k]: v });
  const activeUnits = units?.filter((u) => u.active) ?? [];
  const unitId = g.unitId || activeUnits[0]?.id || '';

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError('');
    setMsg('');
    const body = {
      ...g,
      unitId,
      positionId: g.positionId || null,
      contractEndDate: g.contractEndDate || null,
      terminationDate: g.terminationDate || null,
      birthDate: g.birthDate || null,
      vacationDaysPerYear: g.vacationDaysPerYear === '' ? null : Number(g.vacationDaysPerYear),
      ...(sensitive && {
        sensitive: {
          ...s,
          baseSalary: s.baseSalary === '' ? null : Number(s.baseSalary),
          iban: s.iban.trim() ? s.iban : null,
          allowances: s.allowances
            .filter((a) => a.name)
            .map((a) => ({ name: a.name, amount: Number(a.amount) })),
        },
      }),
    };
    try {
      const saved = await api<Employee>(e ? `/employees/${e.id}` : '/employees', {
        method: e ? 'PUT' : 'POST',
        body,
      });
      if (e) {
        setMsg(t('common.saved'));
        reload();
      } else navigate(`/rh/funcionarios/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="max-w-4xl space-y-4">
      <Link to="/rh" className="text-sm text-slate-500 hover:underline">
        {t('common.back')}
      </Link>
      <h2 className="text-lg font-semibold">
        {e ? `${e.number} · ${e.name}` : t('hr.newEmployee')}
      </h2>
      {balance && balance.entitlement != null && (
        <p className="text-sm text-slate-600">
          {t('hr.vacationBalance', {
            year,
            entitlement: balance.entitlement,
            used: balance.used,
            pending: balance.pending,
            available: balance.available ?? '—',
          })}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <fieldset
          disabled={!manage}
          className="grid gap-3 rounded-xl border bg-white shadow-xs p-4 md:grid-cols-4"
        >
          <F label={`${t('hr.number')} *`}>
            <input
              className={inputCls}
              required
              value={g.number}
              onChange={(x) => setGv('number', x.target.value)}
            />
          </F>
          <F label={`${t('hr.name')} *`} span>
            <input
              className={inputCls}
              required
              value={g.name}
              onChange={(x) => setGv('name', x.target.value)}
            />
          </F>
          <F label={`${t('hr.unit')} *`}>
            <select
              className={inputCls}
              value={unitId}
              onChange={(x) => setGv('unitId', x.target.value)}
            >
              {activeUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </F>
          <F label={t('hr.position')}>
            <select
              className={inputCls}
              value={g.positionId}
              onChange={(x) => setGv('positionId', x.target.value)}
            >
              <option value="">—</option>
              {positions
                ?.filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </F>
          <F label={t('hr.contractType')}>
            <select
              className={inputCls}
              value={g.contractType}
              onChange={(x) => setGv('contractType', x.target.value)}
            >
              {(['PERMANENT', 'FIXED_TERM', 'OTHER'] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`contract.${c}`)}
                </option>
              ))}
            </select>
          </F>
          <F label={`${t('hr.hireDate')} *`}>
            <input
              className={inputCls}
              type="date"
              required
              value={g.hireDate}
              onChange={(x) => setGv('hireDate', x.target.value)}
            />
          </F>
          <F label={t('hr.contractEndDate')}>
            <input
              className={inputCls}
              type="date"
              value={g.contractEndDate}
              onChange={(x) => setGv('contractEndDate', x.target.value)}
            />
          </F>
          <F label={t('hr.terminationDate')}>
            <input
              className={inputCls}
              type="date"
              value={g.terminationDate}
              onChange={(x) => setGv('terminationDate', x.target.value)}
            />
          </F>
          <F label={t('hr.birthDate')}>
            <input
              className={inputCls}
              type="date"
              value={g.birthDate}
              onChange={(x) => setGv('birthDate', x.target.value)}
            />
          </F>
          <F label={t('hr.vacationDays')}>
            <input
              className={inputCls}
              type="number"
              min={0}
              max={60}
              value={g.vacationDaysPerYear}
              onChange={(x) => setGv('vacationDaysPerYear', x.target.value)}
            />
          </F>
          <F label={t('hr.phone')}>
            <input
              className={inputCls}
              value={g.phone}
              onChange={(x) => setGv('phone', x.target.value)}
            />
          </F>
          <F label={t('hr.email')}>
            <input
              className={inputCls}
              type="email"
              value={g.email}
              onChange={(x) => setGv('email', x.target.value)}
            />
          </F>
          <F label={t('hr.address')} span>
            <input
              className={inputCls}
              value={g.address}
              onChange={(x) => setGv('address', x.target.value)}
            />
          </F>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={g.active}
              onChange={(x) => setGv('active', x.target.checked)}
            />
            {t('common.active')}
          </label>
        </fieldset>

        {sensitive && (
          <fieldset
            disabled={!manage}
            className="space-y-3 rounded border border-amber-300 bg-amber-50/40 p-4"
          >
            <legend className="px-1 font-medium">{t('hr.sensitive')}</legend>
            <p className="text-xs text-slate-500">{t('hr.sensitiveHint')}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <F label={t('hr.baseSalary')}>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  step={1}
                  value={s.baseSalary}
                  onChange={(x) => setSv('baseSalary', x.target.value)}
                />
              </F>
              <F label={t('hr.nif')}>
                <input
                  className={inputCls}
                  value={s.nif}
                  onChange={(x) => setSv('nif', x.target.value)}
                />
              </F>
              <F label={t('hr.idNumber')}>
                <input
                  className={inputCls}
                  value={s.idNumber}
                  onChange={(x) => setSv('idNumber', x.target.value)}
                />
              </F>
              <F label={t('hr.socialSecurityNo')}>
                <input
                  className={inputCls}
                  value={s.socialSecurityNo}
                  onChange={(x) => setSv('socialSecurityNo', x.target.value)}
                />
              </F>
              <F label={t('hr.bankName')}>
                <input
                  className={inputCls}
                  value={s.bankName}
                  onChange={(x) => setSv('bankName', x.target.value)}
                />
              </F>
              <F label={t('hr.iban')}>
                <input
                  className={inputCls}
                  value={s.iban}
                  onChange={(x) => setSv('iban', x.target.value)}
                />
              </F>
            </div>
            <div className="space-y-2 text-sm">
              <span className="font-medium">{t('hr.allowances')}</span>
              {s.allowances.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    aria-label={t('hr.allowanceName')}
                    className={inputCls}
                    value={a.name}
                    onChange={(x) =>
                      setSv(
                        'allowances',
                        s.allowances.map((y, j) => (j === i ? { ...y, name: x.target.value } : y)),
                      )
                    }
                  />
                  <input
                    aria-label={t('hr.amount')}
                    className={`${inputBase} w-40`}
                    type="number"
                    min={0}
                    step={1}
                    value={a.amount}
                    onChange={(x) =>
                      setSv(
                        'allowances',
                        s.allowances.map((y, j) =>
                          j === i ? { ...y, amount: Number(x.target.value) } : y,
                        ),
                      )
                    }
                  />
                  <label className="flex items-center gap-1 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={a.inssSubject ?? true}
                      onChange={(x) =>
                        setSv(
                          'allowances',
                          s.allowances.map((y, j) =>
                            j === i ? { ...y, inssSubject: x.target.checked } : y,
                          ),
                        )
                      }
                    />

                    {t('payroll.inssSubject')}
                  </label>

                  <input
                    aria-label={t('payroll.irtExempt')}
                    title={t('payroll.irtExempt')}
                    placeholder={t('payroll.irtExempt')}
                    className={`${inputBase} w-40`}
                    type="number"
                    min={0}
                    step={1}
                    value={a.irtExemptUpTo ?? 0}
                    onChange={(x) =>
                      setSv(
                        'allowances',
                        s.allowances.map((y, j) =>
                          j === i ? { ...y, irtExemptUpTo: Number(x.target.value) } : y,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() =>
                      setSv(
                        'allowances',
                        s.allowances.filter((_, j) => j !== i),
                      )
                    }
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={secondaryCls}
                onClick={() =>
                  setSv('allowances', [
                    ...s.allowances,
                    { name: '', amount: 0, inssSubject: true, irtExemptUpTo: 0 },
                  ])
                }
              >
                {t('common.add')}
              </button>
            </div>
          </fieldset>
        )}
        <ErrorBox>{error}</ErrorBox>
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        {manage && <button className={buttonCls}>{t('common.save')}</button>}
      </form>

      {e && sensitive && e.documents && <Documents employee={e} reload={reload} />}
      {e && canPayroll && <Deductions employeeId={e.id} />}
    </div>
  );
}

function Documents({ employee, reload }: { employee: Employee; reload: () => void }) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const stored = await apiUpload<{ url: string; name: string }>('/uploads', file);
      await api(`/employees/${employee.id}/documents`, {
        body: { name: name || stored.name, url: stored.url, expiresAt: expiresAt || null },
      });
      setName('');
      setExpiresAt('');
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2 rounded-xl border bg-white shadow-xs p-4">
      <h3 className="font-medium">{t('hr.documents')}</h3>
      <ul className="divide-y text-sm">
        {employee.documents!.map((d) => (
          <li key={d.id} className="flex items-center justify-between py-1">
            <button
              className="text-blue-700 hover:underline"
              onClick={() => apiOpen(d.url).catch((e: Error) => setError(e.message))}
            >
              {d.name}
            </button>
            <span className="flex items-center gap-3 text-slate-500">
              {d.expiresAt && `${t('hr.docExpires')}: ${formatDate(d.expiresAt)}`}
              <ConfirmButton
                className="text-red-600 hover:underline"
                onConfirm={() =>
                  api(`/employees/${employee.id}/documents/${d.id}`, { method: 'DELETE' }).then(
                    reload,
                  )
                }
              >
                {t('common.remove')}
              </ConfirmButton>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <F label={t('hr.docName')}>
          <input className={inputCls} value={name} onChange={(x) => setName(x.target.value)} />
        </F>
        <F label={t('hr.docExpires')}>
          <input
            className={inputCls}
            type="date"
            value={expiresAt}
            onChange={(x) => setExpiresAt(x.target.value)}
          />
        </F>
        <label className="space-y-1">
          <span>{t('hr.addDocument')}</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={busy}
            className="block"
            onChange={(x) => upload(x.target.files?.[0])}
          />
        </label>
      </div>
      <ErrorBox>{error}</ErrorBox>
    </section>
  );
}
