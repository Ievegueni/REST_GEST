import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Feature } from '@restgest/shared';
import { Layout } from './components/Layout';
import { FeatureGate } from './features/session';
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
import { DashboardPage } from './modules/reports/DashboardPage';
import { ReportsPage } from './modules/reports/ReportsPage';
import { ReplenishmentPage } from './modules/purchases/ReplenishmentPage';
import { HrLayout } from './modules/hr/HrLayout';
import { EmployeesPage } from './modules/hr/EmployeesPage';
import { EmployeePage } from './modules/hr/EmployeePage';
import { SchedulePage } from './modules/hr/SchedulePage';
import { AttendancePage } from './modules/hr/AttendancePage';
import { LeavesPage } from './modules/hr/LeavesPage';
import { PositionsPage } from './modules/hr/PositionsPage';
import { PayrollPage } from './modules/payroll/PayrollPage';
import { RunPage } from './modules/payroll/RunPage';
import { TaxTablesPage } from './modules/admin/TaxTablesPage';
import { PayrollSettingsPage } from './modules/settings/PayrollSettingsPage';
import { CashSettingsPage } from './modules/settings/CashSettingsPage';
import { CostCategoriesPage, DailyCostsPage, RecurringCostsPage } from './modules/costs/CostsPage';
import { CashSessionsPage } from './modules/cash/CashSessionsPage';
import { CashSessionPage } from './modules/cash/CashSessionPage';
import { PayablesPage } from './modules/payables/PayablesPage';
import { PayablePage } from './modules/payables/PayablePage';
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
        <Route path="tabelas-fiscais" element={<TaxTablesPage />} />
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
          <Route path="reposicao" element={<ReplenishmentPage />} />
        </Route>
        <Route path="/fornecedores" element={gate('stock', <SuppliersPage />)} />
        <Route path="/fornecedores/:id" element={gate('stock', <SupplierPage />)} />

        <Route path="/" element={<DashboardPage />} />
        <Route path="/relatorios" element={gate('reports_stock', <ReportsPage />)} />
        <Route path="/rh" element={gate('hr', <HrLayout />)}>
          <Route index element={<EmployeesPage />} />
          <Route path="funcionarios/:id" element={<EmployeePage />} />
          <Route path="escalas" element={<SchedulePage />} />
          <Route path="presencas" element={<AttendancePage />} />
          <Route path="licencas" element={<LeavesPage />} />
          <Route path="cargos" element={<PositionsPage />} />
        </Route>
        <Route path="/custos" element={gate('daily_costs', <DailyCostsPage />)} />
        <Route path="/custos/recorrentes" element={gate('daily_costs', <RecurringCostsPage />)} />
        <Route path="/custos/categorias" element={gate('daily_costs', <CostCategoriesPage />)} />
        <Route path="/caixa" element={gate('cash_closing', <CashSessionsPage />)} />
        <Route path="/caixa/:id" element={gate('cash_closing', <CashSessionPage />)} />
        <Route path="/contas-a-pagar" element={gate('payables', <PayablesPage />)} />
        <Route path="/contas-a-pagar/:id" element={gate('payables', <PayablePage />)} />
        <Route path="/salarios" element={gate('payroll', <PayrollPage />)} />
        <Route path="/salarios/:id" element={gate('payroll', <RunPage />)} />
        <Route path="/alertas" element={gate('alerts_sms', <AlertsPage />)} />
        <Route path="/definicoes" element={<SettingsLayout />}>
          <Route index element={<Navigate to="plano" replace />} />
          <Route path="plano" element={<PlanPage />} />
          <Route path="unidades" element={<UnitsPage />} />
          <Route path="utilizadores" element={<UsersPage />} />
          <Route path="stock" element={<StockSettingsPage />} />
          <Route path="alertas" element={gate('alerts_sms', <AlertSettingsPage />)} />
          <Route path="salarios" element={gate('payroll', <PayrollSettingsPage />)} />
          <Route path="caixa" element={gate('cash_closing', <CashSettingsPage />)} />
        </Route>
      </Route>
    </Routes>
  );
}
