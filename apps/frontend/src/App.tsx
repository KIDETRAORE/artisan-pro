import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth.store";
import { useUser } from "./context/user.context";
import { fetchWithAuth } from "./auth/fetchWithAuth";

import Layout from "./layout/Layout";
import Login from "./pages/Login";
import Vision from "./pages/Vision";
import Devis from "./pages/Devis";
import Compta from "./pages/Compta";
import Dashboard from "./pages/Dashboard";

// ✅ nouvelles pages
import Help from "./pages/Help";
import Settings from "./pages/Settings";
import Upgrade from "./pages/Upgrade";
import Billing from "./pages/Billing";

type DashboardResponse = {
  user?: { email?: string | null };
  subscription?: { plan?: string };
  quota?: { used?: number; limit?: number };
};

export default function App() {
  const { user, accessToken } = useAuth();
  const { setUserData } = useUser();

  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!user?.email || !accessToken) return;

      setBootError(null);

      try {
        const data = await fetchWithAuth<DashboardResponse>("/dashboard");

        const email = user.email;
        const emailName = email.split("@")[0] || "Artisan";
        const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);

        const plan = (data.subscription?.plan ?? "FREE").toString().toUpperCase();
        const used = Number(data.quota?.used ?? 0);
        const limit = Number(data.quota?.limit ?? 0);

        if (cancelled) return;

        setUserData({
          name: formattedName,
          email,
          plan,
          quota: { used, limit },
        });
      } catch (e: any) {
        if (cancelled) return;
        setBootError(e?.message ?? "Erreur lors du chargement des infos compte.");
        // on peut laisser l'app continuer, mais sans quota/plan.
        setUserData({
          name: user.email.split("@")[0] || "Artisan",
          email: user.email,
          plan: "FREE",
          quota: { used: 0, limit: 0 },
        });
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [user?.email, accessToken, setUserData]);

  return (
    <>
      {bootError && accessToken && (
        <div className="bg-amber-50 border-b border-amber-100 text-amber-800 text-xs px-4 py-2">
          {bootError}
        </div>
      )}

      <Routes>
        <Route
          path="/login"
          element={!accessToken ? <Login /> : <Navigate to="/dashboard" replace />}
        />

        <Route element={accessToken ? <Layout /> : <Navigate to="/login" replace />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/devis" element={<Devis />} />
          <Route path="/compta" element={<Compta />} />

          {/* Billing */}
          <Route path="/upgrade" element={<Upgrade />} />
          <Route path="/billing" element={<Billing />} />

          <Route path="/help" element={<Help />} />
          <Route path="/settings" element={<Settings />} />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}