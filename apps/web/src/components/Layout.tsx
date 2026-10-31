import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CookingPot,
  FileSpreadsheet,
  HandCoins,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import type { Feature } from '@restgest/shared';
import { useSession } from '../features/session';
import { NotificationBell } from '../modules/alerts/NotificationBell';
import { t, type TKey } from '../i18n';
import { Shell, type ShellNavItem } from './Shell';

export const NAV: (Omit<ShellNavItem, 'label'> & { label: TKey; feature?: Feature })[] = [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/catalogo/produtos', label: 'nav.catalog', icon: Package, feature: 'stock' },
  { to: '/fornecedores', label: 'nav.suppliers', icon: Truck, feature: 'stock' },
  { to: '/stock', label: 'nav.stock', icon: Warehouse, feature: 'stock' },
  { to: '/compras', label: 'nav.purchases', icon: ShoppingCart, feature: 'purchases' },
  { to: '/fichas', label: 'nav.recipes', icon: CookingPot, feature: 'recipes' },
  { to: '/vendas', label: 'nav.salesImport', icon: FileSpreadsheet, feature: 'sales_import' },
  { to: '/rh', label: 'nav.hr', icon: Users, feature: 'hr' },
  { to: '/salarios', label: 'nav.payroll', icon: HandCoins, feature: 'payroll' },
  { to: '/custos', label: 'nav.costs', icon: ReceiptText, feature: 'daily_costs' },
  { to: '/caixa', label: 'nav.cash', icon: Wallet, feature: 'cash_closing' },
  { to: '/contas-a-pagar', label: 'nav.payables', icon: ClipboardList, feature: 'payables' },
  { to: '/resultados', label: 'nav.results', icon: TrendingUp, feature: 'financial_results' },
  { to: '/analisador', label: 'nav.ai', icon: Sparkles, feature: 'ai_analyzer' },
  { to: '/alertas', label: 'nav.alerts', icon: Bell, feature: 'alerts_sms' },
  { to: '/relatorios', label: 'nav.reports', icon: BarChart3, feature: 'reports_stock' },
  { to: '/definicoes/plano', label: 'nav.settings', icon: Settings },
];

/** Área autenticada: redirecciona para login sem sessão. */
export function Layout() {
  const { session, loading, unitId, setUnitId, logout, endImpersonation } = useSession();
  const navigate = useNavigate();

  if (loading) return <p className="p-6 text-gray-500">{t('common.loading')}</p>;
  if (!session) return <Navigate to="/login" replace />;

  const nav = NAV.filter((n) => !n.feature || session.features.includes(n.feature)).map((n) => ({
    ...n,
    label: t(n.label),
  }));

  return (
    <Shell
      brandSubtitle={session.tenant.name}
      logoUrl={session.tenant.logoUrl}
      nav={nav}
      user={{ name: session.user.name, role: session.role }}
      onLogout={logout}
      banner={
        session.impersonated && (
          <div className="flex items-center justify-center gap-3 bg-amber-400 px-4 py-1.5 text-sm text-amber-950">
            {t('impersonation.banner')} <strong>{session.tenant.name}</strong>
            <button
              className="rounded-md bg-amber-950/10 px-2 py-0.5 font-medium hover:bg-amber-950/20"
              onClick={() => {
                navigate('/admin');
                endImpersonation();
              }}
            >
              {t('impersonation.end')}
            </button>
          </div>
        )
      }
      header={
        <>
          <label className="relative flex items-center">
            <span className="sr-only">{t('units.label')}</span>
            <Building2
              aria-hidden
              className="pointer-events-none absolute left-2.5 hidden size-4 text-gray-400 sm:block"
            />
            <select
              id="unit"
              aria-label={t('units.label')}
              className="w-48 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pr-7 pl-2.5 sm:w-auto sm:max-w-56 sm:min-w-44 sm:pr-8 sm:pl-8 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none"
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
          </label>
          {session.features.includes('alerts_sms') && <NotificationBell />}
        </>
      }
    >
      <Outlet />
    </Shell>
  );
}
