import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Feature, Permission, Plan } from '@restgest/shared';
import { api, refresh, setAccessToken } from '../lib/api';

export type Session = {
  user: { id: string; name: string; email: string };
  role: string;
  permissions: string[];
  tenant: { id: string; name: string; plan: Plan };
  features: Feature[];
  units: { id: string; name: string }[];
  /** sessão aberta por um Super Admin */
  impersonated: boolean;
};

type SessionState = {
  session: Session | null;
  loading: boolean;
  /** '' = todas as unidades */
  unitId: string;
  setUnitId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  startImpersonation: (accessToken: string) => Promise<void>;
  endImpersonation: () => void;
};

export const SessionContext = createContext<SessionState | null>(null);

const UNIT_KEY = 'restgest.unitId';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [unitId, setUnitIdState] = useState(() => localStorage.getItem(UNIT_KEY) ?? '');

  const load = useCallback(async () => setSession(await api<Session>('/me')), []);

  useEffect(() => {
    refresh()
      .then((ok) => (ok ? load() : undefined))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, [load]);

  const value: SessionState = {
    session,
    loading,
    unitId: session?.units.some((u) => u.id === unitId) ? unitId : '',
    setUnitId: (id) => {
      localStorage.setItem(UNIT_KEY, id);
      setUnitIdState(id);
    },
    login: async (email, password) => {
      const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
        body: { email, password },
      });
      setAccessToken(accessToken);
      await load();
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      setAccessToken(null);
      setSession(null);
    },
    startImpersonation: async (accessToken) => {
      setAccessToken(accessToken);
      await load();
    },
    endImpersonation: () => {
      setAccessToken(null);
      setSession(null);
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fora de SessionProvider');
  return ctx;
}

export const useFeature = (feature: Feature) =>
  useSession().session?.features.includes(feature) ?? false;

export const useCan = (permission: Permission) =>
  useSession().session?.permissions.includes(permission) ?? false;

export function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: Feature;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{useFeature(feature) ? children : fallback}</>;
}
