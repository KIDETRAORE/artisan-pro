// src/auth/AdminRoute.tsx

import { Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../store/auth.store";

interface AdminRouteProps {
  children: JSX.Element;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const {
    user,
    accessToken,
    isLoading,
    restoreSession,
  } = useAuth() as {
    user: any;
    accessToken?: string | null;
    isLoading: boolean;
    restoreSession?: () => void | Promise<void>;
  };

  /**
   * 🔁 Tentative de restauration de session
   * (refresh via cookie httpOnly Supabase)
   */
  useEffect(() => {
    if (!user && !accessToken && restoreSession) {
      restoreSession();
    }
  }, [user, accessToken, restoreSession]);

  /**
   * ⏳ En attente backend
   */
  if (isLoading) {
    return <p>Chargement...</p>;
  }

  /**
   * 🚫 Non authentifié
   */
  if (!user || !accessToken) {
    return <Navigate to="/login" replace />;
  }

  /**
   * ⛔ Authentifié mais pas admin
   */
  if ((user.role ?? "user") !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  /**
   * 👑 Admin autorisé
   */
  return children;
}