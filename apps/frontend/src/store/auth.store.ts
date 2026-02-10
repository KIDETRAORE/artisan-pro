import { create } from "zustand";
import * as authApi from "../api/auth.api";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,

  login: async (email, password) => {
    const res = await authApi.login(email, password);
    set({
      user: res.user,
      accessToken: res.accessToken,
      isAuthenticated: true,
    });
  },

  refresh: async () => {
    const res = await authApi.refresh();
    if (!res?.accessToken) throw new Error();

    set((s) => ({
      ...s,
      accessToken: res.accessToken,
      isAuthenticated: true,
    }));
  },

  logout: async () => {
    await authApi.logout();
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    });
  },
}));
