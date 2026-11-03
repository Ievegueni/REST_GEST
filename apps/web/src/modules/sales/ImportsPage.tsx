import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buttonCls, ErrorBox, inputCls, tableCls, tdCls, thCls } from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { apiUpload } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { Unit } from '../types';
import type { Import, ImportRow, Profile } from './types';

export function ImportsPage() {
  const navigate = useNavigate();
  const { data, error } = useApi<ImportRow[]>('/sales-imports');
  const { data: units } = useApi<Unit[]>('/units');
  const { data: profiles } = useApi<Profile[]>('/import-profiles');
  const [unitId, setUnitId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [upError, setUpError] = useState('');
  const [busy, setBusy] = useState(false);

  const activeUnits = units?.filter((u) => u.active) ?? [];
  const activeProfiles = profiles?.filter((p) => p.active) ?? [];
  const unit = unitId || activeUnits[0]?.id || '';
  const profile = activeProfiles.find((p) => p.id === profileId) ?? activeProfiles[0];
  const needsDate = profile && !profile.columns.date;

  const pick = () => {
    setUpError('');
    if (needsDate && !profile.section && !saleDate) {
      setUpError(t('sales.saleDateMissing'));
      return;
    }
    fileRef.current?.click();
  };

  const upload = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !profile) return;
    setBusy(true);
    setUpError('');
    try {
      const imp = await apiUpload<Import>('/sales-imports', file, {
        unitId: unit,
        profileId: profile.id,
        ...(needsDate && saleDate && { saleDate }),
      });
      navigate(`/vendas/${imp.id}`);
    } catch (err) {
      setUpError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-white shadow-xs p-4 text-sm"
      >
        <label className="space-y-1">
          <span>{t('sales.unit')}</span>
          <select className={inputCls} value={unit} onChange={(e) => setUnitId(e.target.value)}>
            {activeUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span>{t('sales.profile')}</span>
          <select
            className={inputCls}
            value={profile?.id ?? ''}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {activeProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {needsDate && (
          <label className="space-y-1">
            <span>{t('sales.saleDate')}</span>
            <input
              className={inputCls}
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </label>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <button
          type="button"
          className={buttonCls}
          onClick={pick}
          disabled={busy || !profile || !unit}
        >
          {busy ? t('common.loading') : t('sales.upload')}
        </button>
        <ErrorBox>{upError}</ErrorBox>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('common.number')}</th>
            <th className={thCls}>{t('sales.unit')}</th>
            <th className={thCls}>{t('sales.period')}</th>
            <th className={thCls}>{t('sales.file')}</th>
            <th className={`${thCls} text-right`}>{t('sales.rows')}</th>
            <th className={`${thCls} text-right`}>{t('sales.amount')}</th>
            <th className={thCls}>{t('common.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => navigate(`/vendas/${r.id}`)}
            >
              <td className={tdCls}>{r.number}</td>
              <td className={tdCls}>{r.unit.name}</td>
              <td className={tdCls}>
                {r.periodFrom ? `${formatDate(r.periodFrom)} – ${formatDate(r.periodTo)}` : '—'}
              </td>
              <td className={tdCls}>{r.fileName}</td>
              <td className={`${tdCls} text-right`}>{r.rowCount}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(r.totalAmount)}</td>
              <td className={tdCls}>{t(`importStatus.${r.status}` as TKey)}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={7}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
