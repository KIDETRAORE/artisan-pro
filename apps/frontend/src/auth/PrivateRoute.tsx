import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth.store";

export default function PrivateRoute({
  children,
}: {
  children: JSX.Element;
}) {
  const { user, accessToken, isLoading } = useAuth();

  /**
   * ⏳ Attente de la restauration globale (App.tsx)
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
