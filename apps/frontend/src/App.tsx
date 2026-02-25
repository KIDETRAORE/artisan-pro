import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth.store";
import { useUser } from "./context/user.context";

import Layout from "./layout/Layout";
import Login from "./pages/Login";
import Vision from "./pages/Vision";
import Devis from "./pages/Devis";
import Compta from "./pages/Compta";

// ✅ nouvelles pages
import Help from "./pages/Help";
import Settings from "./pages/Settings";

export default function App() {
  const { user, accessToken } = useAuth();
  const { setUserData } = useUser();

  useEffect(() => {
    if (user?.email && accessToken) {
      const emailName = user.email.split("@")[0] || "Artisan";
      const formattedName =
        emailName.charAt(0).toUpperCase() + emailName.slice(1);

      // ⚠️ Tu peux remplacer ces valeurs par un fetch réel plus tard
      setUserData({
        name: formattedName,
        email: user.email,
        plan: "PRO",
        quota: { used: 3, limit: 10 },
      });
    }
  }, [user?.email, accessToken, setUserData]); // ✅ deps propres

  return (
    <Routes>
      {/* Route Publique */}
      <Route
        path="/login"
        element={!accessToken ? <Login /> : <Navigate to="/vision" replace />}
      />

      {/* Groupe de Routes Protégées */}
      <Route
        element={accessToken ? <Layout /> : <Navigate to="/login" replace />}
      >
        <Route path="/vision" element={<Vision />} />
        <Route path="/devis" element={<Devis />} />
        <Route path="/compta" element={<Compta />} />

        {/* ✅ Ajout HELP / SETTINGS */}
        <Route path="/help" element={<Help />} />
        <Route path="/settings" element={<Settings />} />

        {/* Redirections internes */}
        <Route path="/" element={<Navigate to="/vision" replace />} />
        <Route path="/dashboard" element={<Navigate to="/vision" replace />} />
        <Route path="/assistant" element={<Navigate to="/vision" replace />} />
        <Route path="/factures" element={<Navigate to="/devis" replace />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}