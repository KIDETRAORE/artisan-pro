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
  } = useAuth();

  /**
   * 🔁 Tentative de restauration de session
   * (refresh token via cookie httpOnly)
   */
  useEffect(() => {
    if (!user && !accessToken) {
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
  if (user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  /**
   * 👑 Admin autorisé
   */
  return children;
}
