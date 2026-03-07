// apps/frontend/src/App.tsx
import React, { useEffect, Suspense, lazy, useRef } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth.store";
import {
  useUser,
  normalizePlan,
  normalizeStatus,
  isProActive,
} from "./context/user.context";
import Layout from "./layout/Layout";
import Login from "./pages/Login";
import Devis from "./pages/Devis";
import Settings from "./pages/Settings";
import { fetchWithAuth } from "./auth/fetchWithAuth";

// ✅ routes Stripe pages
import Upgrade from "./pages/Upgrade";
import Billing from "./pages/Billing";
import Success from "./pages/Success";
import Cancel from "./pages/Cancel";

// ✅ RESET PASSWORD (route publique)
import ResetPassword from "./pages/ResetPassword";

// ✅ MODIF (Option B): lazy-load pages lourdes
const Vision = lazy(() => import("./pages/Vision"));
const Compta = lazy(() => import("./pages/Compta"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Assistant = lazy(() => import("./pages/Assistant"));

// ✅ AJOUT: pages dashboard détaillées
const DashboardRevenue = lazy(() => import("./pages/DashboardRevenue"));
const DashboardUnpaid = lazy(() => import("./pages/DashboardUnpaid"));
const DashboardQuotes = lazy(() => import("./pages/DashboardQuotes"));

// ✅ AJOUT: Factures module
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));

// ✅ AJOUT: page publique paiement OK
const InvoicePaid = lazy(() => import("./pages/InvoicePaid"));

// ✅ AJOUT: pages chantiers
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDashboard = lazy(() => import("./pages/ProjectDashboard"));
const ProjectExpensesPage = lazy(() => import("./pages/ProjectExpensesPage"));

type DashboardResponse = {
  user?: { id: string; email?: string | null };
  subscription?: {
    plan?: string;
    status?: string;
    currentPeriodEnd?: any;
  };
  quota?: {
    used: number;
    limit: number;
    percent?: number;
    resetAt?: string | null;
  };
};

export default function App() {
  const { user, accessToken } = useAuth();
  const { setUserData, clearUserData } = useUser();

  // ✅ MODIF: évite multi-fetch /dashboard en boucle
  const dashboardFetchInFlightRef = useRef(false);

  // ✅ MODIF: dépendance stable (évite boucle si `user` change de référence)
  const userEmail = user?.email ?? null;

  useEffect(() => {
    const run = async () => {
      if (!accessToken) return;
      if (dashboardFetchInFlightRef.current) return;

      dashboardFetchInFlightRef.current = true;

      try {
        const data = await fetchWithAuth<DashboardResponse>("/dashboard", {
          method: "GET",
        });

        const finalEmail = data?.user?.email ?? userEmail;
        if (!finalEmail) {
          clearUserData();
          return;
        }

        const emailName = finalEmail.split("@")[0] || "Artisan";
        const formattedName =
          emailName.charAt(0).toUpperCase() + emailName.slice(1);

        const plan = normalizePlan(data?.subscription?.plan ?? "free");
        const status = normalizeStatus(data?.subscription?.status ?? "inactive");
        const proActive = isProActive(plan, status);

        setUserData({
          name: formattedName,
          email: finalEmail,
          plan,
          status,
          quota: proActive
            ? undefined
            : {
                used: data?.quota?.used ?? 0,
                limit: data?.quota?.limit ?? 0,
              },
        });
      } catch {
        clearUserData();
      } finally {
        dashboardFetchInFlightRef.current = false;
      }
    };

    void run();
  }, [accessToken, userEmail, setUserData, clearUserData]);

  return (
    <Suspense fallback={<div className="p-4">Chargement…</div>}>
      <Routes>
        <Route
          path="/login"
          element={!accessToken ? <Login /> : <Navigate to="/vision" replace />}
        />

        {/* ✅ Route publique reset password */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ✅ AJOUT: route publique de succès paiement facture */}
        <Route path="/invoice-paid" element={<InvoicePaid />} />

        <Route
          element={accessToken ? <Layout /> : <Navigate to="/login" replace />}
        >
          <Route path="/vision" element={<Vision />} />
          <Route path="/devis" element={<Devis />} />
          <Route path="/compta" element={<Compta />} />

          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/revenue" element={<DashboardRevenue />} />
          <Route path="/dashboard/unpaid" element={<DashboardUnpaid />} />
          <Route path="/dashboard/quotes" element={<DashboardQuotes />} />

          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/factures" element={<Navigate to="/invoices" replace />} />

          {/* ✅ AJOUT: routes chantiers */}
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDashboard />} />
          <Route
            path="/projects/:id/expenses"
            element={<ProjectExpensesPage />}
          />

          <Route path="/settings" element={<Settings />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/assistant" element={<Assistant />} />

          {/* ✅ routes Stripe */}
          <Route path="/upgrade" element={<Upgrade />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/success" element={<Success />} />
          <Route path="/cancel" element={<Cancel />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}