import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, Maximize, RotateCcw } from 'lucide-react';
import { useCan, useFeature, useSession } from '../../features/session';
import { t, type TKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatQty } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Status = 'NEW' | 'IN_PROGRESS' | 'READY';
type Ticket = {
  id: string;
  table: string | null;
  waiter: string | null;
  status: Status;
  seenAt: string;
  items: { id: string; label: string; qty: string; cancelled: boolean }[];
};
type Board = {
  now: string;
  tickets: Ticket[];
  ready: Ticket[];
  zones: string[];
  warnMinutes: number;
  lateMinutes: number;
};

const POLL_MS = 5_000;
const NEXT: Record<Status, Status> = { NEW: 'IN_PROGRESS', IN_PROGRESS: 'READY', READY: 'READY' };
const SOUND_KEY = 'restgest.kdsSound';

/** Dois toques curtos (Web Audio: não precisa de ficheiro de som). */
function chime(ctx: AudioContext) {
  [880, 1320].forEach((hz, i) => {
    const at = ctx.currentTime + i * 0.25;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + 0.45);
  });
}

/**
 * Aviso sonoro quando chega um talão novo (não ao abrir o ecrã nem ao recuperar).
 * Os browsers só deixam tocar depois de um toque/tecla: o som desbloqueia no primeiro.
 * Ligado/desligado fica guardado nesta TV.
 */
function useChime(tickets: Ticket[]) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [locked, setLocked] = useState(true);
  const ctx = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const unlock = () => {
      ctx.current ??= new AudioContext();
      void ctx.current.resume().then(() => setLocked(ctx.current?.state !== 'running'));
    };
    unlock(); // na app da TV o som não precisa de gesto; no browser fica bloqueado até tocar
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const ids = tickets.map((x) => x.id);
    const fresh = seen.current ? ids.filter((id) => !seen.current!.has(id)) : [];
    seen.current = new Set([...(seen.current ?? []), ...ids]);
    if (fresh.length && on && ctx.current?.state === 'running') chime(ctx.current);
  }, [tickets, on]);

  const toggle = () => {
    setOn(!on);
    try {
      localStorage.setItem(SOUND_KEY, on ? '0' : '1');
    } catch {
      /* armazenamento indisponível: fica só nesta sessão */
    }
  };
  return { on, locked, toggle };
}

/**
 * Ecrã de cozinha (TV, ecrã inteiro). Navegação por teclado numérico / bump bar:
 * 1–9 escolhe o talão · ← → muda · Enter/Espaço avança (Novo → Em produção → Pronto) ·
 * Backspace recupera o último pronto. Também funciona por toque ou rato.
 */
export function KitchenPage() {
  const { session, loading, unitId: sessionUnit } = useSession();
  const enabled = useFeature('kitchen_display');
  const allowed = useCan('kitchen.manage');
  const [params, setParams] = useSearchParams();
  const unitId = params.get('unidade') || sessionUnit || session?.units[0]?.id || '';
  const zone = params.get('zona') ?? '';
  const { data, error, reload } = useApi<Board>(
    session && enabled && allowed && unitId
      ? `/kitchen/tickets?unitId=${unitId}${zone ? `&zone=${encodeURIComponent(zone)}` : ''}`
      : null,
  );
  const [selected, setSelected] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const p = setInterval(reload, POLL_MS);
    return () => clearInterval(p);
  }, [reload]);
  // relógio pelo servidor (o relógio da TV pode estar errado), actualizado a cada segundo
  useEffect(() => {
    if (!data) return;
    const skew = Date.parse(data.now) - Date.now();
    const s = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(s);
  }, [data]);

  const tickets = useMemo(() => data?.tickets ?? [], [data]);
  const sel = Math.min(selected, Math.max(tickets.length - 1, 0));
  const sound = useChime(tickets);

  const setStatus = useCallback(
    async (id: string, status: Status) => {
      await api(`/kitchen/tickets/${id}/status`, { body: { status } }).catch(() => undefined);
      reload();
    },
    [reload],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && n <= tickets.length) setSelected(n - 1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
        setSelected(Math.min(sel + 1, tickets.length - 1));
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setSelected(Math.max(sel - 1, 0));
      else if ((e.key === 'Enter' || e.key === ' ') && tickets[sel])
        void setStatus(tickets[sel].id, NEXT[tickets[sel].status]);
      else if (e.key === 'Backspace' && data?.ready[0])
        void setStatus(data.ready[0].id, 'IN_PROGRESS');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tickets, sel, data, setStatus]);
  // o talão seleccionado fica sempre à vista quando há mais talões do que cabem no ecrã
  useEffect(() => {
    document.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (!enabled || !allowed)
    return <Screen>{t(enabled ? 'kds.noPermission' : 'kds.notInPlan')}</Screen>;

  // zona por ecrã (?zona=Cozinha): sem zona, escolhe-se uma
  if (data && !zone)
    return (
      <Screen>
        <p className="mb-6 text-2xl">{t('kds.chooseZone')}</p>
        <div className="flex flex-wrap justify-center gap-4">
          {data.zones.map((z) => (
            <button
              key={z}
              onClick={() => setParams({ ...Object.fromEntries(params), zona: z })}
              className="rounded-2xl bg-white/10 px-8 py-6 text-3xl font-bold hover:bg-white/20"
            >
              {z}
            </button>
          ))}
          {!data.zones.length && <p className="text-slate-400">{t('kds.noZones')}</p>}
        </div>
      </Screen>
    );

  const minutes = (iso: string) => Math.max(0, (now - Date.parse(iso)) / 60_000);
  const clock = (iso: string) => {
    const s = Math.floor(minutes(iso) * 60);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const counts = (s: Status) => tickets.filter((x) => x.status === s).length;

  return (
    <div className="min-h-screen bg-night-950 p-4 text-white">
      <header className="mb-4 flex flex-wrap items-center gap-4">
        <Link to="/" className="text-slate-400 hover:text-white" aria-label={t('kds.back')}>
          <ArrowLeft className="size-6" />
        </Link>
        <h1 className="text-3xl font-bold">{zone}</h1>
        <span className="rounded-lg bg-sky-500/20 px-3 py-1 text-lg text-sky-200">
          {t('kds.new', { n: counts('NEW') })}
        </span>
        <span className="rounded-lg bg-amber-500/20 px-3 py-1 text-lg text-amber-200">
          {t('kds.inProgress', { n: counts('IN_PROGRESS') })}
        </span>
        <span className="hidden text-sm text-slate-400 lg:inline">{t('kds.keys')}</span>
        <div className="ml-auto flex items-center gap-2">
          {sound.on && sound.locked && (
            <span className="text-sm text-amber-300">{t('kds.soundLocked')}</span>
          )}
          <button
            onClick={sound.toggle}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            aria-label={t(sound.on ? 'kds.soundOff' : 'kds.soundOn')}
            title={t(sound.on ? 'kds.soundOff' : 'kds.soundOn')}
          >
            {sound.on ? <Bell className="size-5" /> : <BellOff className="size-5" />}
          </button>
          <button
            disabled={!data?.ready[0]}
            onClick={() => data?.ready[0] && setStatus(data.ready[0].id, 'IN_PROGRESS')}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-30"
          >
            <RotateCcw className="size-5" /> {t('kds.recall')}
          </button>
          <button
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            aria-label={t('kds.fullscreen')}
          >
            <Maximize className="size-5" />
          </button>
        </div>
      </header>
      {error && <p className="mb-3 text-red-300">{error}</p>}
      {data && !tickets.length && (
        <p className="mt-32 text-center text-3xl text-slate-500">{t('kds.empty')}</p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {tickets.map((x, i) => {
          const m = minutes(x.seenAt);
          const band =
            m >= data!.lateMinutes
              ? 'bg-red-600'
              : m >= data!.warnMinutes
                ? 'bg-amber-500 text-night-950'
                : 'bg-emerald-600';
          return (
            <article
              key={x.id}
              onClick={() => setSelected(i)}
              data-selected={i === sel || undefined}
              className={`flex flex-col overflow-hidden rounded-2xl bg-white/5 transition-transform ${
                i === sel
                  ? 'relative z-10 scale-[1.03] ring-8 ring-sky-400 ring-offset-4 ring-offset-night-950'
                  : 'ring-1 ring-white/10'
              }`}
            >
              <div className={`flex items-center gap-3 px-4 py-2 ${band}`}>
                {i < 9 && (
                  <span className="flex size-8 items-center justify-center rounded-full bg-black/30 text-lg font-bold">
                    {i + 1}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-2xl font-bold whitespace-nowrap">
                    {x.table ? t('kds.table', { n: x.table }) : '—'}
                  </span>
                  {x.waiter && <span className="block truncate text-base">{x.waiter}</span>}
                </span>
                <span className="ml-auto font-mono text-2xl tabular-nums">{clock(x.seenAt)}</span>
              </div>
              {x.status === 'IN_PROGRESS' && (
                <div className="bg-amber-500/20 px-4 py-1 text-sm font-semibold text-amber-200">
                  {t('kds.status.IN_PROGRESS')}
                </div>
              )}
              <ul className="flex-1 space-y-1 px-4 py-3 text-xl">
                {x.items.map((it) => (
                  <li key={it.id} className={it.cancelled ? 'text-slate-500 line-through' : ''}>
                    <span className="font-bold">{formatQty(it.qty)}×</span> {it.label}
                  </li>
                ))}
              </ul>
              <button
                onClick={(e) => (e.stopPropagation(), void setStatus(x.id, NEXT[x.status]))}
                className={`py-4 text-xl font-bold ${
                  x.status === 'NEW'
                    ? 'bg-sky-600 hover:bg-sky-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {t(`kds.action.${x.status}` as TKey)}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-night-950 p-6 text-center text-white">
      {children}
    </div>
  );
}
