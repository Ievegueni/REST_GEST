import { NavLink, Outlet } from 'react-router-dom';
import { t, type TKey } from '../i18n';

export const NAV: { to: string; label: TKey }[] = [
  { to: '/', label: 'nav.dashboard' },
  { to: '/stock', label: 'nav.stock' },
  { to: '/compras', label: 'nav.purchases' },
  { to: '/fichas', label: 'nav.recipes' },
  { to: '/vendas', label: 'nav.salesImport' },
  { to: '/relatorios', label: 'nav.reports' },
  { to: '/definicoes', label: 'nav.settings' },
];

export type UnitOption = { id: string; name: string };

export function Layout({ units = [] }: { units?: UnitOption[] }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-100">
        <div className="px-4 py-5 text-lg font-semibold">{t('app.name')}</div>
        <nav className="flex flex-col gap-1 px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-700' : 'hover:bg-slate-800'}`
              }
            >
              {t(n.label)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b bg-white px-6">
          <label htmlFor="unit" className="text-sm text-slate-500">
            {t('units.label')}
          </label>
          <select id="unit" className="rounded border px-2 py-1 text-sm">
            <option value="">{t('units.all')}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
