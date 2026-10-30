import { Route, Routes } from 'react-router-dom';
import { Layout, NAV } from './components/Layout';
import { t } from './i18n';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {NAV.map((n) => (
          <Route
            key={n.to}
            path={n.to}
            element={
              <>
                <h1 className="mb-2 text-xl font-semibold">{t(n.label)}</h1>
                <p className="text-slate-500">{t('common.comingSoon')}</p>
              </>
            }
          />
        ))}
      </Route>
    </Routes>
  );
}
