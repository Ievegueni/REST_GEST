import { useEffect, useState } from 'react';
import { Clock, Phone, Plus, Users } from 'lucide-react';
import { ConfirmButton } from '../../components/ConfirmButton';
import { FormDrawer, type Values } from '../../components/FormDrawer';
import {
  Badge,
  buttonCls,
  Drawer,
  ErrorBox,
  inputCls,
  PageHeader,
  secondaryCls,
} from '../../components/ui';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatTime, nowLocal } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { today } from '../hr/types';
import { UnitSelect, useUnitChoice } from '../hr/UnitSelect';

export type DiningTable = {
  id: string;
  name: string;
  seats: number;
  area: string | null;
  active: boolean;
};
type Status = 'BOOKED' | 'SEATED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';
type Reservation = {
  id: string;
  tableId: string | null;
  customerName: string;
  phone: string | null;
  partySize: number;
  startsAt: string;
  status: Status;
  walkIn: boolean;
  notes: string | null;
  seatedAt: string | null;
};
type Board = { tables: DiningTable[]; reservations: Reservation[] };

const POLL_MS = 15_000;
const tone = {
  BOOKED: 'amber',
  SEATED: 'red',
  DONE: 'gray',
  CANCELLED: 'gray',
  NO_SHOW: 'gray',
} as const;
const minutesSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));

/** Ecrã da recepção (tablet): grelha de mesas + reservas do dia, actualizado sozinho. */
export function ReceptionPage() {
  const [unitId, setUnitId] = useState('');
  const { units, unit } = useUnitChoice(unitId);
  const [date, setDate] = useState(today());
  const { data, error, reload } = useApi<Board>(
    unit ? `/reservations/board?unitId=${unit}&date=${date}` : null,
  );
  useEffect(() => {
    const i = setInterval(reload, POLL_MS);
    return () => clearInterval(i);
  }, [reload]);

  const [form, setForm] = useState<{ item?: Reservation; walkInTable?: DiningTable } | null>(null);
  const [table, setTable] = useState<DiningTable | null>(null);
  const [seating, setSeating] = useState<Reservation | null>(null);
  const [err, setErr] = useState('');

  const tables = data?.tables ?? [];
  const reservations = data?.reservations ?? [];
  const occupant = (id: string) =>
    reservations.find((r) => r.tableId === id && r.status === 'SEATED');
  const nextBooking = (id: string) =>
    reservations.find((r) => r.tableId === id && r.status === 'BOOKED');
  const waiting = reservations.filter((r) => r.status === 'BOOKED');
  const free = tables.filter((x) => !occupant(x.id));
  const areas = [...new Set(tables.map((x) => x.area ?? ''))];

  const patch = async (id: string, body: object) => {
    setErr('');
    try {
      await api(`/reservations/${id}`, { method: 'PATCH', body });
      setTable(null);
      setSeating(null);
      reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  const save = async (v: Values) => {
    const body = { ...v, startsAt: new Date(v.startsAt as string).toISOString() };
    if (form?.item) await api(`/reservations/${form.item.id}`, { method: 'PATCH', body });
    else
      await api('/reservations', {
        body: { ...body, unitId: unit, walkIn: !!form?.walkInTable },
      });
    setTable(null);
    reload();
  };

  return (
    <>
      <PageHeader title={t('res.title')} subtitle={t('res.subtitle')}>
        <button className={`${buttonCls} px-5 py-3 text-base`} onClick={() => setForm({})}>
          <Plus className="size-5" /> {t('res.new')}
        </button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {units.length > 1 && <UnitSelect value={unit} units={units} onChange={setUnitId} />}
        <label className="space-y-1 text-sm">
          <span>{t('res.day')}</span>
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <div className="ml-auto flex gap-2 text-sm">
          <Badge tone="emerald">{t('res.free', { n: free.length })}</Badge>
          <Badge tone="red">{t('res.occupied', { n: tables.length - free.length })}</Badge>
          <Badge tone="amber">{t('res.waiting', { n: waiting.length })}</Badge>
        </div>
      </div>
      <ErrorBox>{error || err}</ErrorBox>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-5">
          {!tables.length && data && <p className="text-gray-500">{t('res.noTables')}</p>}
          {areas.map((area) => (
            <div key={area}>
              {area && <h2 className="mb-2 text-sm font-semibold text-gray-600">{area}</h2>}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                {tables
                  .filter((x) => (x.area ?? '') === area)
                  .map((x) => {
                    const occ = occupant(x.id);
                    const next = nextBooking(x.id);
                    const cls = occ
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : next
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-900';
                    return (
                      <button
                        key={x.id}
                        onClick={() => setTable(x)}
                        className={`flex min-h-28 flex-col items-start rounded-xl border-2 p-3 text-left shadow-xs transition active:scale-95 ${cls}`}
                      >
                        <span className="text-xl font-bold">{x.name}</span>
                        <span className="flex items-center gap-1 text-xs opacity-75">
                          <Users className="size-3.5" /> {x.seats}
                        </span>
                        <span className="mt-auto w-full truncate text-sm font-medium">
                          {occ
                            ? `${occ.customerName} · ${t('res.minutes', { n: minutesSince(occ.seatedAt ?? occ.startsAt) })}`
                            : next
                              ? `${formatTime(next.startsAt)} ${next.customerName}`
                              : t('res.tableFree')}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-600">{t('res.ofDay')}</h2>
          {data && !reservations.length && <p className="text-sm text-gray-500">{t('res.none')}</p>}
          {reservations.map((r) => {
            const tableName = tables.find((x) => x.id === r.tableId)?.name;
            const ended = r.status !== 'BOOKED' && r.status !== 'SEATED';
            return (
              <div
                key={r.id}
                className={`rounded-xl border bg-white p-3 shadow-xs ${ended ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.customerName}</div>
                    <div className="flex flex-wrap gap-x-3 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" /> {formatTime(r.startsAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" /> {r.partySize}
                      </span>
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="flex items-center gap-1 underline">
                          <Phone className="size-3.5" /> {r.phone}
                        </a>
                      )}
                      {tableName && <span>{t('res.table', { name: tableName })}</span>}
                    </div>
                    {r.notes && <p className="mt-1 text-sm text-gray-500">{r.notes}</p>}
                  </div>
                  <Badge tone={tone[r.status]}>{t(`res.status.${r.status}` as TKey)}</Badge>
                </div>
                {r.status === 'BOOKED' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={`${buttonCls} py-2.5`} onClick={() => setSeating(r)}>
                      {t('res.arrived')}
                    </button>
                    <button
                      className={`${secondaryCls} py-2.5`}
                      onClick={() => setForm({ item: r })}
                    >
                      {t('common.edit')}
                    </button>
                    <ConfirmButton
                      className={`${secondaryCls} py-2.5`}
                      onConfirm={() => patch(r.id, { status: 'NO_SHOW' })}
                    >
                      {t('res.noShow')}
                    </ConfirmButton>
                    <ConfirmButton onConfirm={() => patch(r.id, { status: 'CANCELLED' })}>
                      {t('res.cancel')}
                    </ConfirmButton>
                  </div>
                )}
                {r.status === 'SEATED' && (
                  <button
                    className={`${secondaryCls} mt-3 py-2.5`}
                    onClick={() => patch(r.id, { status: 'DONE' })}
                  >
                    {t('res.release')}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {/* tocar numa mesa: libertar, ou sentar alguém nela */}
      {table && (
        <Drawer title={t('res.table', { name: table.name })} onClose={() => setTable(null)}>
          <ErrorBox>{err}</ErrorBox>
          {(() => {
            const occ = occupant(table.id);
            if (occ)
              return (
                <div className="space-y-4">
                  <p>
                    <strong>{occ.customerName}</strong> · {occ.partySize} {t('res.people')} ·{' '}
                    {t('res.since', { time: formatTime(occ.seatedAt ?? occ.startsAt) })}
                  </p>
                  <button
                    className={`${buttonCls} w-full py-3 text-base`}
                    onClick={() => patch(occ.id, { status: 'DONE' })}
                  >
                    {t('res.release')}
                  </button>
                </div>
              );
            return (
              <div className="space-y-3">
                <button
                  className={`${buttonCls} w-full py-3 text-base`}
                  onClick={() => setForm({ walkInTable: table })}
                >
                  {t('res.walkIn')}
                </button>
                {waiting.length > 0 && (
                  <h3 className="pt-2 text-sm font-semibold text-gray-600">{t('res.seatHere')}</h3>
                )}
                {waiting.map((r) => (
                  <button
                    key={r.id}
                    className={`${secondaryCls} w-full justify-between py-3`}
                    onClick={() => patch(r.id, { status: 'SEATED', tableId: table.id })}
                  >
                    <span>
                      {formatTime(r.startsAt)} · {r.customerName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-4" /> {r.partySize}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}
        </Drawer>
      )}

      {/* chegou: escolher mesa livre (as que têm lugares suficientes primeiro) */}
      {seating && (
        <Drawer
          title={t('res.chooseTable', { name: seating.customerName })}
          onClose={() => setSeating(null)}
        >
          <ErrorBox>{err}</ErrorBox>
          {!free.length && <p className="text-gray-500">{t('res.noFree')}</p>}
          <div className="grid grid-cols-3 gap-3">
            {[...free]
              .sort(
                (a, b) =>
                  Number(b.seats >= seating.partySize) - Number(a.seats >= seating.partySize) ||
                  Number(b.id === seating.tableId) - Number(a.id === seating.tableId) ||
                  a.seats - b.seats,
              )
              .map((x) => (
                <button
                  key={x.id}
                  onClick={() => patch(seating.id, { status: 'SEATED', tableId: x.id })}
                  className={`rounded-xl border-2 p-3 text-left active:scale-95 ${
                    x.seats >= seating.partySize
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  <div className="text-lg font-bold">{x.name}</div>
                  <div className="flex items-center gap-1 text-xs">
                    <Users className="size-3.5" /> {x.seats}
                    {x.area && ` · ${x.area}`}
                  </div>
                </button>
              ))}
          </div>
        </Drawer>
      )}

      {form && (
        <FormDrawer
          title={
            form.walkInTable
              ? `${t('res.walkIn')} · ${form.walkInTable.name}`
              : form.item
                ? t('res.edit')
                : t('res.new')
          }
          fields={[
            { key: 'customerName', label: t('res.name'), required: true },
            ...(form.walkInTable ? [] : [{ key: 'phone', label: t('res.phone') }]),
            { key: 'partySize', label: t('res.partySize'), type: 'number', required: true },
            ...(form.walkInTable
              ? []
              : [
                  {
                    key: 'startsAt',
                    label: t('res.when'),
                    type: 'datetime-local' as const,
                    required: true,
                  },
                  {
                    key: 'tableId',
                    label: t('res.tableOptional'),
                    type: 'select' as const,
                    options: tables.map((x) => ({
                      value: x.id,
                      label: `${x.name} (${x.seats})`,
                    })),
                  },
                ]),
            { key: 'notes', label: t('res.notes'), type: 'textarea' },
          ]}
          initial={
            form.item
              ? { ...form.item, startsAt: nowLocal(form.item.startsAt) }
              : form.walkInTable
                ? {
                    customerName: t('res.walkInName'),
                    partySize: form.walkInTable.seats,
                    tableId: form.walkInTable.id,
                    startsAt: nowLocal(),
                  }
                : { startsAt: `${date}T${nowLocal().slice(11)}` }
          }
          onSubmit={(v) =>
            save(
              form.walkInTable ? { ...v, tableId: form.walkInTable.id, startsAt: nowLocal() } : v,
            )
          }
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}
