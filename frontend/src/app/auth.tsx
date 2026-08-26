import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "@/api/auth";
import {
  advanceSessionGeneration,
  getSessionGeneration,
  isApiError,
  setUnauthorizedHandler,
} from "@/api/client";
import type { InitializeInput, UserSession } from "@/api/types";

export type Session = UserSession;

interface AuthContextValue {
  loading: boolean;
  initialized: boolean;
  session: Session | null;
  login: (username: string, password: string) => Promise<Session>;
  initialize: (payload: InitializeInput) => Promise<Session>;
  logout: () => Promise<void>;
  refresh: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const refresh = useCallback(async (): Promise<Session | null> => {
    const status = await authApi.authStatus();
    setInitialized(status.initialized);
    if (!status.initialized) {
      setSession(null);
      return null;
    }
    try {
      const current = await authApi.me();
      advanceSessionGeneration();
      setSession(current);
      return current;
    } catch (error) {
      if (!isApiError(error, 401)) throw error;
      setSession(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refresh()
      .catch(() => {
        if (active) {
          setInitialized(true);
          setSession(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler((requestGeneration) => {
      if (requestGeneration !== getSessionGeneration()) return;
      advanceSessionGeneration();
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const current = await authApi.login({ username, password });
    advanceSessionGeneration();
    setInitialized(true);
    setSession(current);
    return current;
  }, []);

  const initialize = useCallback(async (payload: InitializeInput) => {
    const current = await authApi.initialize(payload);
    advanceSessionGeneration();
    setInitialized(true);
    setSession(current);
    return current;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      advanceSessionGeneration();
      setSession(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ loading, initialized, session, login, initialize, logout, refresh }),
    [initialized, initialize, loading, login, logout, refresh, session],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
