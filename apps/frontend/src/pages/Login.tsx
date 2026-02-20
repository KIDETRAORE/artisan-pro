import { useAuth } from "../store/auth.store";
import { Navigate } from "react-router-dom";
import React from "react";

export default function Login() {
  const { user, accessToken, isLoading, login } = useAuth();

  const handleLogin = async () => {
    try {
      await login("test@test.dev", "password123");
      // ❌ PAS de navigate ici
      // PrivateRoute gérera la redirection automatiquement
    } catch {
      alert("Erreur de connexion");
    }
  };

  // ⏳ Pendant chargement
  if (isLoading) {
    return <div style={{ padding: 40 }}>Chargement...</div>;
  }

  // ✅ Déjà connecté → dashboard
  if (user && accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Login</h1>
      <button onClick={handleLogin}>Se connecter</button>
    </div>
  );
}

