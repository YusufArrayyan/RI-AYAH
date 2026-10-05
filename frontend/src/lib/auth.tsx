import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, tokenStore } from "./api";

export type Role = "siswa" | "wali" | "guru" | "bk" | "admin" | "pimpinan" | "komite";

export interface User {
  id: number;
  name: string;
  nickname: string;
  title: string | null;
  role: Role;
  level: string | null;
  class_name: string | null;
  ui_mode: "anak" | "remaja" | "kampus" | null;
  high_contrast: boolean;
  is_coordinator: boolean;
  institution: { name: string; kind: string } | null;
  needs_reconfirm: boolean;
  environment: string;
}

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refresh: () => Promise<void>;
  patch: (u: Partial<User>) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      setUser(await api<User>("/api/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      refresh,
      login: (token, u) => {
        tokenStore.set(token);
        setUser(u);
      },
      logout: () => {
        tokenStore.clear();
        setUser(null);
      },
      patch: (p) => setUser((u) => (u ? { ...u, ...p } : u)),
    }),
    [user, ready, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth di luar AuthProvider");
  return v;
}

export const ROLE_HOME: Record<Role, string> = {
  siswa: "/siswa",
  wali: "/wali",
  guru: "/guru",
  bk: "/bk",
  admin: "/admin",
  pimpinan: "/pimpinan",
  komite: "/komite",
};

export const ROLE_LABEL: Record<Role, string> = {
  siswa: "Siswa",
  wali: "Orang tua atau wali",
  guru: "Guru wali kelas",
  bk: "Guru BK",
  admin: "Admin sekolah",
  pimpinan: "Pimpinan",
  komite: "Komite etik dan DPO",
};
