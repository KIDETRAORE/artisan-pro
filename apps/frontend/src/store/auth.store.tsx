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
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true, // 🔥 Important : true au démarrage

  /**
   * ======================
   * LOGIN
   * ======================
   */
  login: async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }
  },

  /**
   * ======================
   * LOGOUT
   * ======================
   */
  logout: async () => {
    await supabase.auth.signOut();
  },
}));

/**
 * ======================
 * 🔥 Sync UNIQUE et contrôlée
 * ======================
 */
supabase.auth.onAuthStateChange((_event, session) => {
  useAuth.setState((state) => {
    const newUser = session
      ? {
          id: session.user.id,
          email: session.user.email ?? "",
        }
      : null;

    const newToken = session?.access_token ?? null;

    // 🚫 Évite les updates inutiles
    if (
      state.user?.id === newUser?.id &&
      state.accessToken === newToken
    ) {
      return state;
    }

    return {
      user: newUser,
      accessToken: newToken,
      isLoading: false,
    };
  });
});