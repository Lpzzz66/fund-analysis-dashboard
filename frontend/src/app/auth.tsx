import { createContext, useContext, useState, type ReactNode } from "react";
import * as api from "@/mock/api";
import type { UserRole } from "@/utils/constants";

export interface Session {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  status: "active" | "disabled";
}

interface AuthCtx {
  session: Session | null;
  initialized: boolean;
  login: (username: string, password: string) => Promise<Session>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const Ctx = createContext<AuthCtx>(null as never);

const KEY = "fd-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  });
  const [initialized] = useState(true);

  function persist(s: Session | null) {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
    setSession(s);
  }

  return (
    <Ctx.Provider
      value={{
        session,
        initialized,
        login: async (username, password) => {
          const res = await api.login(username, password);
          if (res.data.id === 0) throw new Error("账号或密码错误");
          const s: Session = {
            id: res.data.id,
            username: res.data.username,
            display_name: res.data.display_name,
            role: res.data.role,
            status: res.data.status,
          };
          persist(s);
          return s;
        },
        logout: () => persist(null),
        switchRole: (role) => {
          if (!session) return;
          const next = { ...session, role, username: role, display_name: role === "admin" ? "系统管理员" : role === "operator" ? "张业务" : "王看板" };
          persist(next);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
