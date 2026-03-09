import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth.store";

export default function PublicRoute({
  children,
}: {
  children: JSX.Element;
}) {
  const { user, accessToken, isLoading } = useAuth();

  if (isLoading) {
    return <p>Chargement...</p>;
  }

  if (user && accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
