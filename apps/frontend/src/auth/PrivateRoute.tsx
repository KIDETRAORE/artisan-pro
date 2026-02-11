import { Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../store/auth.store";

export default function PrivateRoute({
  children,
}: {
  children: JSX.Element;
}) {
  const { user, accessToken, isLoading, restoreSession } = useAuth();

  /**
   * 🔁 Tentative de restauration de session
   * (refresh token via cookie)
   */
  useEffect(() => {
    if (!user && !accessToken) {
      restoreSession();
    }
  }, [user, accessToken, restoreSession]);

  /**
   * ⏳ En attente de la réponse backend
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
   * ✅ Auth OK
   */
  return children;
}
