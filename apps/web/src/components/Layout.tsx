import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Feature } from '@restgest/shared';
import { useSession } from '../features/session';
import { NotificationBell } from '../modules/alerts/NotificationBell';
import { t, type TKey } from '../i18n';

export const NAV: { to: string; label: TKey; feature?: Feature }[] = [
  { to: '/', label: 'nav.dashboard' },
  { to: '/catalogo/produtos', label: 'nav.catalog', feature: 'stock' },
  { to: '/fornecedores', label: 'nav.suppliers', feature: 'stock' },
  { to: '/stock', label: 'nav.stock', feature: 'stock' },
  { to: '/compras', label: 'nav.purchases', feature: 'purchases' },
  { to: '/fichas', label: 'nav.recipes', feature: 'recipes' },
  { to: '/vendas', label: 'nav.salesImport', feature: 'sales_import' },
  { to: '/rh', label: 'nav.hr', feature: 'hr' },
  { to: '/alertas', label: 'nav.alerts', feature: 'alerts_sms' },
  { to: '/relatorios', label: 'nav.reports', feature: 'reports_stock' },
  { to: '/definicoes/plano', label: 'nav.settings' },
];

/** Secção activa pelo primeiro segmento do caminho (ex.: /catalogo/...). */
const section = (path: string) => path.split('/')[1] ?? '';

/** Área autenticada: redirecciona para login sem sessão. */
export function Layout() {
  const { session, loading, unitId, setUnitId, logout, endImpersonation } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (loading) return <p className="p-6 text-slate-500">{t('common.loading')}</p>;
  if (!session) return <Navigate to="/login" replace />;

  const nav = NAV.filter((n) => !n.feature || session.features.includes(n.feature));

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-100">
        <div className="px-4 py-5">
          <div className="text-lg font-semibold">{t('app.name')}</div>
          <div className="truncate text-xs text-slate-400">{session.tenant.name}</div>
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={() =>
                `rounded px-3 py-2 text-sm ${section(pathname) === section(n.to) ? 'bg-slate-700' : 'hover:bg-slate-800'}`
              }
            >
              {t(n.label)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        {session.impersonated && (
          <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-1.5 text-sm text-amber-900">
            {t('impersonation.banner')} <strong>{session.tenant.name}</strong>
            <button
              className="underline"
              onClick={() => {
                navigate('/admin');
                endImpersonation();
              }}
            >
              {t('impersonation.end')}
            </button>
          </div>
        )}
        <header className="flex h-14 items-center justify-end gap-3 border-b bg-white px-6">
          <label htmlFor="unit" className="text-sm text-slate-500">
            {t('units.label')}
          </label>
          <select
            id="unit"
            className="rounded border px-2 py-1 text-sm"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            {session.units.length !== 1 && <option value="">{t('units.all')}</option>}
            {session.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {session.features.includes('alerts_sms') && <NotificationBell />}
          <span className="text-sm">{session.user.name}</span>
          <button onClick={logout} className="text-sm text-slate-500 hover:underline">
            {t('auth.logout')}
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
