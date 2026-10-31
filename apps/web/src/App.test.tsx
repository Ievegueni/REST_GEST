import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { effectiveFeatures, type Plan } from '@restgest/shared';
import { App } from './App';
import { FeatureGate, SessionContext, type Session } from './features/session';

function renderAt(path: string, plan: Plan | null) {
  const session: Session | null = plan && {
    user: { id: 'u', name: 'Ana', email: 'ana@x' },
    role: 'Administrador',
    permissions: [],
    tenant: { id: 't', name: 'Demo', plan, logoUrl: null },
    features: [...effectiveFeatures(plan)],
    units: [{ id: 'u1', name: 'Centro' }],
    impersonated: false,
  };
  const value = {
    session,
    loading: false,
    unitId: '',
    setUnitId: () => {},
    login: async () => {},
    logout: async () => {},
    startImpersonation: async () => {},
    endImpersonation: () => {},
    reload: async () => {},
  };
  return render(
    <SessionContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <FeatureGate feature="hr">
          <span>conteúdo RH</span>
        </FeatureGate>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

afterEach(cleanup);

describe('App', () => {
  it('sem sessão redirecciona para o login', () => {
    renderAt('/stock', null);
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('renderiza layout com menu, unidades e página activa', () => {
    renderAt('/stock', 'STOCK');
    expect(screen.getByRole('heading', { name: 'Stock' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compras' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Centro' })).toBeTruthy();
  });

  it('FeatureGate esconde conteúdo fora do plano', () => {
    renderAt('/', 'STOCK');
    expect(screen.queryByText('conteúdo RH')).toBeNull();
  });

  it('FeatureGate mostra conteúdo no plano COMPLETO', () => {
    renderAt('/', 'COMPLETO');
    expect(screen.getByText('conteúdo RH')).toBeTruthy();
  });

  it('Definições → Plano mostra bloqueadas no plano STOCK', () => {
    renderAt('/definicoes/plano', 'STOCK');
    expect(screen.getByText('Recursos humanos')).toBeTruthy();
    expect(screen.getAllByText('Disponível no plano Completo')).toHaveLength(7);
  });
});
