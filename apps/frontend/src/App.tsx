import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth.store";
import { useUser, normalizePlan, normalizeStatus, isProActive } from "./context/user.context";
import Layout from "./layout/Layout";
import Login from "./pages/Login";
import Vision from "./pages/Vision";
import Devis from "./pages/Devis";
import Compta from "./pages/Compta";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import { fetchWithAuth } from "./auth/fetchWithAuth";

type DashboardResponse = {
  user?: { id: string; email?: string | null };
  subscription?: {
    plan?: string; // ✅ MODIF: backend truth is "free"|"pro" (we normalize)
    status?: string;
    currentPeriodEnd?: any;
  };
  quota?: { used: number; limit: number; percent?: number; resetAt?: string | null };
};

export default function App() {
  const { user, accessToken } = useAuth();
  const { setUserData, clearUserData } = useUser();

  useEffect(() => {
    const run = async () => {
      if (!accessToken || !user?.email) return;

      try {
        const data = await fetchWithAuth<DashboardResponse>("/dashboard", {
          method: "GET",
        });

        const emailName = user.email.split("@")[0] || "Artisan";
        const formattedName =
          emailName.charAt(0).toUpperCase() + emailName.slice(1);

        const plan = normalizePlan(data?.subscription?.plan ?? "free");
        const status = normalizeStatus(data?.subscription?.status ?? "inactive");
        const proActive = isProActive(plan, status);

        setUserData({
          name: formattedName,
          email: user.email,
          plan,
          status,
          // ✅ UI: quota undefined => illimité (comme ton Topbar/Layout)
          quota: proActive
            ? undefined
            : {
                used: data?.quota?.used ?? 0,
                limit: data?.quota?.limit ?? 0,
              },
        });
      } catch {
        // si ça fail, on évite de casser l'app
        clearUserData();
      }
    };

    run();
  }, [user, accessToken, setUserData, clearUserData]);

  return (
    <Routes>
      {/* 1. Route Publique */}
      <Route
        path="/login"
        element={!accessToken ? <Login /> : <Navigate to="/vision" replace />}
      />

      {/* 2. Groupe de Routes Protégées */}
      <Route element={accessToken ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/vision" element={<Vision />} />
        <Route path="/devis" element={<Devis />} />
        <Route path="/compta" element={<Compta />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/assistant" element={<Navigate to="/vision" replace />} />
        <Route path="/factures" element={<Navigate to="/devis" replace />} />
      </Route>

      {/* 3. Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}