import { useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChefHat,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { t } from '../i18n';

/** match: prefixos extra que também activam o item (além do próprio `to`, exacto) */
export type ShellNavItem = { to: string; label: string; icon: LucideIcon; match?: string[] };

/** Marca da plataforma: ícone num quadrado branco + nome. */
export function BrandMark({
  subtitle,
  size = 'sm',
  compact = false,
}: {
  subtitle?: string;
  size?: 'sm' | 'lg';
  compact?: boolean;
}) {
  const lg = size === 'lg';
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm ${lg ? 'size-14' : 'size-10'}`}
      >
        <ChefHat className={lg ? 'size-8' : 'size-6'} strokeWidth={1.75} />
      </span>
      <div className={`min-w-0 leading-tight ${compact ? 'sr-only' : ''}`}>
        <div className={`font-semibold tracking-tight text-white ${lg ? 'text-2xl' : 'text-base'}`}>
          {t('app.name')}
        </div>
        {subtitle && <div className="truncate text-xs text-slate-400">{subtitle}</div>}
      </div>
    </div>
  );
}

/** Primeiro segmento do caminho (ex.: /catalogo/produtos → catalogo). */
const section = (path: string) => path.split('/')[1] ?? '';

const COLLAPSE_KEY = 'restgest.sidebarCollapsed';

export function Shell(props: {
  brandSubtitle: string;
  nav: ShellNavItem[];
  user: { name: string; role: string };
  onLogout: () => void;
  /** controlos extra na barra superior (unidade, notificações) */
  header?: ReactNode;
  /** faixa acima da barra superior (ex.: sessão de suporte) */
  banner?: ReactNode;
  footer?: string;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // sidebar recolhida (só ícones) no computador; lembrada neste browser
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1');
    } catch {
      /* armazenamento indisponível: fica só nesta sessão */
    }
  };
  const active = (n: ShellNavItem) =>
    n.match
      ? pathname === n.to || n.match.some((m) => pathname.startsWith(m))
      : n.to === '/'
        ? pathname === '/'
        : section(pathname) === section(n.to);

  const sidebar = (mini: boolean) => (
    <aside
      className={`flex h-full flex-col bg-night-900 text-slate-300 transition-[width] duration-200 ${mini ? 'w-[72px]' : 'w-64'}`}
    >
      <div className={`flex h-16 items-center ${mini ? 'justify-center' : 'px-4'}`}>
        <BrandMark subtitle={props.brandSubtitle} compact={mini} />
      </div>
      <nav
        className={`sidebar-scroll flex-1 space-y-0.5 overflow-y-auto py-3 px-3`}
        aria-label="Menu principal"
      >
        {props.nav.map((n) => {
          const on = active(n);
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end
              onClick={() => setOpen(false)}
              aria-current={on ? 'page' : undefined}
              title={mini ? n.label : undefined}
              className={`flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition ${
                mini ? 'justify-center px-0' : 'px-3'
              } ${
                on
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
              <span className={mini ? 'sr-only' : 'truncate'}>{n.label}</span>
            </NavLink>
          );
        })}
      </nav>
      {!mini && (
        <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-500">
          {props.footer ?? t('shell.footer')}
        </div>
      )}
    </aside>
  );

  return (
    <div
      className="flex min-h-screen"
      style={{ '--sidebar-w': collapsed ? '72px' : '16rem' } as CSSProperties}
    >
      {/* desktop */}
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">{sidebar(collapsed)}</div>
      {/* móvel */}
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="h-full">{sidebar(false)}</div>
          <button
            aria-label={t('shell.closeMenu')}
            className="flex-1 bg-night-950/50"
            onClick={() => setOpen(false)}
          >
            <X className="ml-auto mt-4 mr-4 size-6 text-white" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {props.banner}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-white/90 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <button
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label={t('shell.openMenu')}
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <button
            className="hidden rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 lg:block"
            aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}
            title={collapsed ? t('shell.expand') : t('shell.collapse')}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
            {props.header}
            <div className="flex shrink-0 items-center gap-2 border-l pl-2 sm:gap-3 sm:pl-4">
              <span className="hidden size-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 sm:flex">
                <User className="size-4.5" strokeWidth={1.75} />
              </span>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-semibold">{props.user.name}</div>
                <div className="text-xs text-gray-500">{props.user.role}</div>
              </div>
              <button
                onClick={props.onLogout}
                title={t('auth.logout')}
                aria-label={t('auth.logout')}
                className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <LogOut className="size-[18px]" />
              </button>
            </div>
          </div>
        </header>
        <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-[1400px] min-w-0">{props.children}</div>
        </main>
      </div>
    </div>
  );
}
