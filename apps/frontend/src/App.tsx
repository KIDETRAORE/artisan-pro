import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { useAuth } from "./store/auth.store";

export default function App() {
  const { user, isLoading, restoreSession } = useAuth();

  // 🔄 Restore session on app start
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // ⏳ Loading state (important)
  if (isLoading) {
    return <div className="p-4">Chargement...</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" /> : <Login />}
      />

      <Route
        path="/dashboard"
        element={user ? <Dashboard /> : <Navigate to="/login" />}
      />

      {/* fallback */}
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
