import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth.store";
import React from "react";

interface PrivateRouteProps {
  children: React.ReactNode;
}

export default function PrivateRoute({ children }: PrivateRouteProps) {
  const { user, accessToken, isLoading } = useAuth();

  /**
   * ⏳ Attente de la restauration de session
   */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Chargement...</p>
      </div>
    );
  }

  /**
   * 🚫 Non authentifié
   */
  if (!user || !accessToken) {
    return <Navigate to="/login" replace />;
  }

  /**
   * ✅ Auth OK
   */
  return <>{children}</>;
}
