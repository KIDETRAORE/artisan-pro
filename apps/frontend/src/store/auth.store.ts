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
  isLoading: true,

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  },

  logout: async () => {
    await supabase.auth.signOut();
  },
}));

/**
 * Synchronisation avec Supabase
 */
supabase.auth.onAuthStateChange((_event, session) => {
  const newUser = session
    ? {
        id: session.user.id,
        email: session.user.email ?? "",
      }
    : null;

  const newToken = session?.access_token ?? null;

  useAuth.setState({
    user: newUser,
    accessToken: newToken,
    isLoading: false, // On libère l'écran de chargement
  });
});

// Sécurité : Si après 5s Supabase n'a pas répondu, on libère le chargement
setTimeout(() => {
  if (useAuth.getState().isLoading) {
    useAuth.setState({ isLoading: false });
  }
}, 5000);