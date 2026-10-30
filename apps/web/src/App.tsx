import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Feature } from '@restgest/shared';
import { Layout, NAV } from './components/Layout';
import { FeatureGate } from './features/session';
import { t } from './i18n';
import { AdminLayout } from './modules/admin/AdminLayout';
import { NewTenantPage } from './modules/admin/NewTenantPage';
import { TenantDetailPage } from './modules/admin/TenantDetailPage';
import { TenantsPage } from './modules/admin/TenantsPage';
import { ForgotPasswordPage } from './modules/auth/ForgotPasswordPage';
import { LoginPage } from './modules/auth/LoginPage';
import { ResetPasswordPage } from './modules/auth/ResetPasswordPage';
import { CatalogLayout } from './modules/catalog/CatalogLayout';
import { CategoriesPage } from './modules/catalog/CategoriesPage';
import { ImportPage } from './modules/catalog/ImportPage';
import { MeasureUnitsPage } from './modules/catalog/MeasureUnitsPage';
import { ProductFormPage } from './modules/catalog/ProductFormPage';
import { ProductsPage } from './modules/catalog/ProductsPage';
import { PlanPage } from './modules/settings/PlanPage';
import { SettingsLayout } from './modules/settings/SettingsLayout';
import { UnitsPage } from './modules/settings/UnitsPage';
import { UsersPage } from './modules/settings/UsersPage';
import { StockSettingsPage } from './modules/settings/StockSettingsPage';
import { AlertSettingsPage } from './modules/settings/AlertSettingsPage';
import { AlertsPage } from './modules/alerts/AlertsPage';
import { BalancesPage } from './modules/stock/BalancesPage';
import { KardexPage } from './modules/stock/KardexPage';
import { MovementPage } from './modules/stock/MovementPage';
import { StockLayout } from './modules/stock/StockLayout';
import { TransfersPage } from './modules/stock/TransfersPage';
import { TransferPage } from './modules/stock/TransferPage';
import { InventoriesPage } from './modules/stock/InventoriesPage';
import { InventoryPage } from './modules/stock/InventoryPage';
import { PurchasesLayout } from './modules/purchases/PurchasesLayout';
import { RecipesLayout } from './modules/recipes/RecipesLayout';
import { SaleItemsPage } from './modules/recipes/SaleItemsPage';
import { SaleItemPage } from './modules/recipes/SaleItemPage';
import { OutputLocationsPage } from './modules/recipes/OutputLocationsPage';
import { SalesLayout } from './modules/sales/SalesLayout';
import { ImportsPage } from './modules/sales/ImportsPage';
import { SalesImportPage } from './modules/sales/ImportPage';
import { MappingsPage } from './modules/sales/MappingsPage';
import { ProfilesPage } from './modules/sales/ProfilesPage';
import { OrdersPage } from './modules/purchases/OrdersPage';
import { OrderPage } from './modules/purchases/OrderPage';
import { ReceiptsPage } from './modules/purchases/ReceiptsPage';
import { NewReceiptPage } from './modules/purchases/NewReceiptPage';
import { ReceiptPage } from './modules/purchases/ReceiptPage';
import { SupplierPage } from './modules/suppliers/SupplierPage';
import { SuppliersPage } from './modules/suppliers/SuppliersPage';

const gate = (feature: Feature, el: ReactNode) => <FeatureGate feature={feature}>{el}</FeatureGate>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<TenantsPage />} />
        <Route path="tenants/novo" element={<NewTenantPage />} />
        <Route path="tenants/:id" element={<TenantDetailPage />} />
      </Route>

      <Route element={<Layout />}>
        <Route path="/catalogo" element={gate('stock', <CatalogLayout />)}>
          <Route index element={<Navigate to="produtos" replace />} />
          <Route path="produtos" element={<ProductsPage />} />
          <Route path="produtos/:id" element={<ProductFormPage />} />
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="unidades-medida" element={<MeasureUnitsPage />} />
          <Route path="importar" element={<ImportPage />} />
        </Route>
        <Route path="/stock" element={gate('stock', <StockLayout />)}>
          <Route index element={<BalancesPage />} />
          <Route path="movimento" element={<MovementPage />} />
          <Route path="produto/:id" element={<KardexPage />} />
          <Route path="transferencias" element={<TransfersPage />} />
          <Route path="transferencias/:id" element={<TransferPage />} />
          <Route path="inventarios" element={<InventoriesPage />} />
          <Route path="inventarios/:id" element={<InventoryPage />} />
        </Route>
        <Route path="/fichas" element={gate('recipes', <RecipesLayout />)}>
          <Route index element={<SaleItemsPage />} />
          <Route path="locais" element={<OutputLocationsPage />} />
          <Route path=":id" element={<SaleItemPage />} />
        </Route>
        <Route path="/vendas" element={gate('sales_import', <SalesLayout />)}>
          <Route index element={<ImportsPage />} />
          <Route path="mapeamento" element={<MappingsPage />} />
          <Route path="perfis" element={<ProfilesPage />} />
          <Route path=":id" element={<SalesImportPage />} />
        </Route>
        <Route path="/compras" element={gate('purchases', <PurchasesLayout />)}>
          <Route index element={<OrdersPage />} />
          <Route path="encomendas/:id" element={<OrderPage />} />
          <Route path="recepcoes" element={<ReceiptsPage />} />
          <Route path="recepcoes/nova" element={<NewReceiptPage />} />
          <Route path="recepcoes/:id" element={<ReceiptPage />} />
        </Route>
        <Route path="/fornecedores" element={gate('stock', <SuppliersPage />)} />
        <Route path="/fornecedores/:id" element={gate('stock', <SupplierPage />)} />

        <Route path="/alertas" element={gate('alerts_sms', <AlertsPage />)} />
        <Route path="/definicoes" element={<SettingsLayout />}>
          <Route index element={<Navigate to="plano" replace />} />
          <Route path="plano" element={<PlanPage />} />
          <Route path="unidades" element={<UnitsPage />} />
          <Route path="utilizadores" element={<UsersPage />} />
          <Route path="stock" element={<StockSettingsPage />} />
          <Route path="alertas" element={gate('alerts_sms', <AlertSettingsPage />)} />
        </Route>

        {NAV.filter((n) => n.placeholder).map((n) => {
          const page = (
            <>
              <h1 className="mb-2 text-xl font-semibold">{t(n.label)}</h1>
              <p className="text-slate-500">{t('common.comingSoon')}</p>
            </>
          );
          return (
            <Route key={n.to} path={n.to} element={n.feature ? gate(n.feature, page) : page} />
          );
        })}
      </Route>
    </Routes>
  );
}
