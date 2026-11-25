import { useState } from 'react';
import { ErrorBox, inputCls, secondaryCls, tableCls, tdCls, thCls } from '../../components/ui';
import { useSession } from '../../features/session';
import { t } from '../../i18n';
import { formatMoney, formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type SoldRow = { code: string; name: string; qty: number; net: number; gross: number };

/** Dia de hoje em Luanda (AAAA-MM-DD), deslocado `days` dias. */
const luandaDay = (days = 0) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda' }).format(d);
};

export function SoldItemsPage() {
  const { unitId } = useSession();
  const [from, setFrom] = useState(luandaDay());
  const [to, setTo] = useState(luandaDay());
  const [search, setSearch] = useState('');
  const presets = [
    { label: t('sold.today'), from: luandaDay(), to: luandaDay() },
    { label: t('sold.yesterday'), from: luandaDay(-1), to: luandaDay(-1) },
    { label: t('sold.last7'), from: luandaDay(-6), to: luandaDay() },
    { label: t('sold.month'), from: `${luandaDay().slice(0, 8)}01`, to: luandaDay() },
  ];

  const qs = new URLSearchParams({
    from,
    to: to < from ? from : to,
    ...(unitId && { unitId }),
    ...(search && { search }),
  });
  const { data, error } = useApi<SoldRow[]>(`/stock/sold-items?${qs}`);
  const qty = data?.reduce((s, r) => s + r.qty, 0) ?? 0;
  const net = data?.reduce((s, r) => s + r.net, 0) ?? 0;
  const gross = data?.reduce((s, r) => s + r.gross, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">{t('reports.from')}</span>
          <input
            className={inputCls}
            type="date"
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">{t('reports.to')}</span>
          <input
            className={inputCls}
            type="date"
            value={to}
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </label>
        {presets.map((p) => (
          <button
            key={p.label}
            className={`${secondaryCls} ${p.from === from && p.to === to ? 'ring-2 ring-slate-400' : ''}`}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
          >
            {p.label}
          </button>
        ))}
        <input
          className={`${inputCls} max-w-xs`}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="text-sm text-gray-500">{t('sold.hint')}</p>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('sold.code')}</th>
            <th className={thCls}>{t('sold.item')}</th>
            <th className={`${thCls} text-right`}>{t('sold.qty')}</th>
            <th className={`${thCls} text-right`}>{t('sold.avgPrice')}</th>
            <th className={`${thCls} text-right`}>{t('sold.net')}</th>
            <th className={`${thCls} text-right`}>{t('sold.gross')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((r) => (
            <tr key={r.code}>
              <td className={`${tdCls} font-mono`}>{r.code}</td>
              <td className={tdCls}>{r.name}</td>
              <td className={`${tdCls} text-right`}>{formatQty(r.qty)}</td>
              <td className={`${tdCls} text-right text-slate-500`}>
                {r.qty ? formatMoney(Math.round(r.gross / r.qty)) : '—'}
              </td>
              <td className={`${tdCls} text-right`}>{formatMoney(r.net)}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(r.gross)}</td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td className={`${tdCls} text-slate-500`} colSpan={6}>
                {t('common.empty')}
              </td>
            </tr>
          )}
        </tbody>
        {!!data?.length && (
          <tfoot className="bg-slate-50 font-medium">
            <tr>
              <td className={tdCls} colSpan={2}>
                {t('sold.totalItems', { n: data.length })}
              </td>
              <td className={`${tdCls} text-right`}>{formatQty(qty)}</td>
              <td className={tdCls} />
              <td className={`${tdCls} text-right`}>{formatMoney(net)}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(gross)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
