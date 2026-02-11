import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PrivateRoute from "./auth/PrivateRoute";

import { useAuth } from "./store/auth.store";

export default function App() {
  const { restoreSession, isLoading } = useAuth();

  /**
   * 🔁 Restaurer la session au démarrage
   * ➜ utilise le refreshToken (cookie httpOnly)
   */
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  /**
   * ⏳ Loader global
   */
  if (isLoading) {
    return <p>Chargement...</p>;
  }

  return (
    <Routes>
      {/* Redirection racine */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Privé */}
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
