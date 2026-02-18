// src/store/auth.store.ts

import { create } from "zustand";
import { supabase } from "../lib/supabase";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: false,

  /**
   * ======================
   * LOGIN
   * ======================
   */
  login: async (email: string, password: string) => {
    set({ isLoading: true });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      set({ isLoading: false });
      throw error;
    }

    if (!data.session || !data.user) {
      set({ isLoading: false });
      throw new Error("Authentication failed");
    }

    set({
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
      },
      accessToken: data.session.access_token,
      isLoading: false,
    });
  },

  /**
   * ======================
   * RESTORE SESSION
   * ======================
   */
  restoreSession: async () => {
    set({ isLoading: true });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      set({
        user: null,
        accessToken: null,
        isLoading: false,
      });
      return;
    }

    set({
      user: {
        id: session.user.id,
        email: session.user.email ?? "",
      },
      accessToken: session.access_token,
      isLoading: false,
    });
  },

  /**
   * ======================
   * LOGOUT
   * ======================
   */
  logout: async () => {
    await supabase.auth.signOut();

    set({
      user: null,
      accessToken: null,
      isLoading: false,
    });
  },
}));

/**
 * ======================
 * 🔥 Synchronisation automatique Supabase
 * ======================
 */
supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    useAuth.setState({
      user: null,
      accessToken: null,
    });
    return;
  }

  useAuth.setState({
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
    },
    accessToken: session.access_token,
  });
});
