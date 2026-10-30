import { useState, type FormEvent } from 'react';
import {
  buttonCls,
  ErrorBox,
  inputBase,
  inputCls,
  secondaryCls,
  tableCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Bracket = { upTo: number | null; fixed: number; rate: number; excessOver: number };
type Table = {
  id: string;
  validFrom: string;
  inssEmployeeRate: string;
  inssEmployerRate: string;
  irtBrackets: Bracket[];
  notes: string | null;
};

export function TaxTablesPage() {
  const { data, error, reload } = useApi<Table[]>('/admin/tax-tables');
  const [editing, setEditing] = useState<Table | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('taxTables.title')}</h1>
        <button className={buttonCls} onClick={() => setEditing('new')}>
          {t('taxTables.new')}
        </button>
      </div>
      <p className="text-sm text-amber-800">{t('taxTables.hint')}</p>
      <ErrorBox>{error}</ErrorBox>
      <table className={tableCls}>
        <thead className="bg-slate-100">
          <tr>
            <th className={thCls}>{t('taxTables.validFrom')}</th>
            <th className={thCls}>{t('taxTables.inssEmployee')}</th>
            <th className={thCls}>{t('taxTables.inssEmployer')}</th>
            <th className={thCls}>{t('taxTables.brackets')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data?.map((tb) => (
            <tr
              key={tb.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => setEditing(tb)}
            >
              <td className={tdCls}>{formatDate(tb.validFrom)}</td>
              <td className={tdCls}>{Number(tb.inssEmployeeRate)}%</td>
              <td className={tdCls}>{Number(tb.inssEmployerRate)}%</td>
              <td className={tdCls}>{tb.irtBrackets.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <TableForm
          key={editing === 'new' ? 'new' : editing.id}
          table={editing === 'new' ? null : editing}
          onDone={() => (setEditing(null), reload())}
        />
      )}
    </div>
  );
}

function TableForm({ table, onDone }: { table: Table | null; onDone: () => void }) {
  const [validFrom, setValidFrom] = useState(table?.validFrom.slice(0, 10) ?? '');
  const [emp, setEmp] = useState(table ? String(Number(table.inssEmployeeRate)) : '');
  const [er, setEr] = useState(table ? String(Number(table.inssEmployerRate)) : '');
  const [brackets, setBrackets] = useState(() =>
    (table?.irtBrackets ?? [{ upTo: null, fixed: 0, rate: 0, excessOver: 0 }]).map((b) => ({
      upTo: b.upTo == null ? '' : String(b.upTo),
      fixed: String(b.fixed),
      rate: String(b.rate),
      excessOver: String(b.excessOver),
    })),
  );
  const [error, setError] = useState('');
  const set = (i: number, k: keyof (typeof brackets)[number], v: string) =>
    setBrackets(brackets.map((b, j) => (j === i ? { ...b, [k]: v } : b)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const body = {
      validFrom,
      inssEmployeeRate: Number(emp),
      inssEmployerRate: Number(er),
      irtBrackets: brackets.map((b) => ({
        upTo: b.upTo === '' ? null : Number(b.upTo),
        fixed: Number(b.fixed),
        rate: Number(b.rate),
        excessOver: Number(b.excessOver),
      })),
    };
    try {
      await (table
        ? api(`/admin/tax-tables/${table.id}`, { method: 'PUT', body })
        : api('/admin/tax-tables', { body }));
      onDone();
    } catch (x) {
      setError((x as Error).message);
    }
  };

  const num = (v: string, on: (v: string) => void, label: string) => (
    <input
      aria-label={label}
      className={`${inputBase} w-32 text-right`}
      type="number"
      min={0}
      step="any"
      required
      value={v}
      onChange={(e) => on(e.target.value)}
    />
  );

  return (
    <form onSubmit={submit} className="space-y-3 rounded border bg-white p-4">
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-sm">
          <span>{t('taxTables.validFrom')}</span>
          <input
            className={inputCls}
            type="date"
            required
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('taxTables.inssEmployee')}</span>
          {num(emp, setEmp, t('taxTables.inssEmployee'))}
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('taxTables.inssEmployer')}</span>
          {num(er, setEr, t('taxTables.inssEmployer'))}
        </label>
      </div>
      <table className="text-sm">
        <thead>
          <tr>
            {(['upTo', 'fixed', 'rate', 'excessOver'] as const).map((k) => (
              <th key={k} className="px-1 text-left font-medium">
                {t(`taxTables.${k}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {brackets.map((b, i) => (
            <tr key={i}>
              <td className="p-1">
                <input
                  aria-label={t('taxTables.upTo')}
                  className={`${inputBase} w-32 text-right`}
                  type="number"
                  min={0}
                  step="any"
                  value={b.upTo}
                  onChange={(e) => set(i, 'upTo', e.target.value)}
                />
              </td>
              <td className="p-1">
                {num(b.fixed, (v) => set(i, 'fixed', v), t('taxTables.fixed'))}
              </td>
              <td className="p-1">{num(b.rate, (v) => set(i, 'rate', v), t('taxTables.rate'))}</td>
              <td className="p-1">
                {num(b.excessOver, (v) => set(i, 'excessOver', v), t('taxTables.excessOver'))}
              </td>
              <td className="p-1">
                {brackets.length > 1 && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => setBrackets(brackets.filter((_, j) => j !== i))}
                  >
                    {t('common.remove')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className={secondaryCls}
        onClick={() =>
          setBrackets([...brackets, { upTo: '', fixed: '0', rate: '0', excessOver: '0' }])
        }
      >
        {t('common.add')}
      </button>
      <ErrorBox>{error}</ErrorBox>
      <button className={buttonCls}>{t('common.save')}</button>
    </form>
  );
}
