import { Route, Routes } from 'react-router-dom';
import { Layout, NAV } from './components/Layout';
import { FeatureGate } from './features/session';
import { t } from './i18n';
import { ForgotPasswordPage } from './modules/auth/ForgotPasswordPage';
import { LoginPage } from './modules/auth/LoginPage';
import { ResetPasswordPage } from './modules/auth/ResetPasswordPage';
import { PlanPage } from './modules/settings/PlanPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route element={<Layout />}>
        <Route path="/definicoes/plano" element={<PlanPage />} />
        {NAV.filter((n) => n.to !== '/definicoes/plano').map((n) => {
          const page = (
            <>
              <h1 className="mb-2 text-xl font-semibold">{t(n.label)}</h1>
              <p className="text-slate-500">{t('common.comingSoon')}</p>
            </>
          );
          return (
            <Route
              key={n.to}
              path={n.to}
              element={n.feature ? <FeatureGate feature={n.feature}>{page}</FeatureGate> : page}
            />
          );
        })}
      </Route>
    </Routes>
  );
}
