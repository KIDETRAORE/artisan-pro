import { create } from "zustand";
import * as authApi from "../api/auth.api";
import type { AuthUser } from "../api/auth.api";

/**
 * ======================
 * TYPES
 * ======================
 */
export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * ======================
 * AUTH STORE
 * ======================
 */
export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  /**
   * LOGIN
   */
  login: async (email, password) => {
    set({ isLoading: true });

    try {
      const res = await authApi.login(email, password);
      const user = await authApi.me(res.accessToken);

      set({
        user,
        accessToken: res.accessToken,
        isLoading: false,
      });
    } catch (err) {
      set({
        user: null,
        accessToken: null,
        isLoading: false,
      });
      throw err;
    }
  },

  /**
   * RESTORE SESSION
   * ➜ appelé au démarrage de l'app
   */
  restoreSession: async () => {
    set({ isLoading: true });

    try {
      const res = await authApi.refresh();
      if (!res?.accessToken) throw new Error();

      const user = await authApi.me(res.accessToken);

      set({
        accessToken: res.accessToken,
        user,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        accessToken: null,
        isLoading: false,
      });
    }
  },

  /**
   * LOGOUT
   */
  logout: async () => {
    await authApi.logout();
    set({
      user: null,
      accessToken: null,
      isLoading: false,
    });
  },
}));
