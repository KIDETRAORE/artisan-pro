import { useEffect, useState } from "react";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { useAuth } from "../store/auth.store";
import { useNavigate, useSearchParams } from "react-router-dom";

type DashboardResponse = {
  message: string;
  user: {
    id: string;
    email: string;
    plan?: string;
  };
  features: {
    generate: boolean;
    analyze: boolean;
    history: boolean;
  };
};

export default function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // ===============================
  // 📦 Chargement Dashboard
  // ===============================
  const loadDashboard = async () => {
    try {
      const json = await fetchWithAuth<DashboardResponse>("/dashboard");
      setData(json);
    } catch (err: any) {
      console.error("Dashboard error:", err);

      if (err.message === "Session expirée") {
        await logout();
        navigate("/login");
        return;
      }

      setError("Impossible de charger le dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // ===============================
  // 🔄 Refresh après succès Stripe
  // ===============================
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      loadDashboard();
      navigate("/dashboard", { replace: true }); // Nettoie l'URL
    }
  }, [searchParams]);

  // ===============================
  // 🚀 Upgrade vers PRO
  // ===============================
  const handleUpgrade = async () => {
    try {
      setUpgradeLoading(true);

      const json = await fetchWithAuth<{ url: string }>(
        "/stripe/create-checkout-session",
        {
          method: "POST",
        }
      );

      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err: any) {
      console.error("Stripe error:", err);
      alert(err.message || "Impossible de lancer le paiement");
    } finally {
      setUpgradeLoading(false);
    }
  };

  // ===============================
  // 💳 Portail Client Stripe
  // ===============================
  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);

      const json = await fetchWithAuth<{ url: string }>(
        "/stripe/portal",
        {
          method: "POST",
        }
      );

      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err: any) {
      console.error("Portal error:", err);
      alert(err.message || "Impossible d'ouvrir le portail");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <p>Chargement du dashboard...</p>;
  if (error) return <p>{error}</p>;
  if (!data) return null;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Dashboard</h1>

      <p>{data.message}</p>

      <p>
        Connecté en tant que <strong>{data.user.email}</strong>
      </p>

      <p>
        Plan actuel : <strong>{data.user.plan}</strong>
      </p>

      <h3>Fonctionnalités</h3>
      <ul>
        <li>Génération devis : {data.features.generate ? "✅" : "❌"}</li>
        <li>Analyse : {data.features.analyze ? "✅" : "❌"}</li>
        <li>Historique : {data.features.history ? "✅" : "❌"}</li>
      </ul>

      {/* ========================= */}
      {/* 🚀 Bouton Upgrade */}
      {/* ========================= */}
      {data.user.plan !== "PRO" && (
        <button
          onClick={handleUpgrade}
          disabled={upgradeLoading}
          style={{
            marginTop: "20px",
            padding: "10px 20px",
            backgroundColor: "#6366f1",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          {upgradeLoading ? "Redirection..." : "🚀 Passer en PRO"}
        </button>
      )}

      {/* ========================= */}
      {/* 💳 Portail Client */}
      {/* ========================= */}
      {data.user.plan === "PRO" && (
        <div style={{ marginTop: "20px" }}>
          <p style={{ color: "green" }}>
            ✅ Vous êtes en plan PRO
          </p>

          <button
            onClick={handleManageSubscription}
            disabled={portalLoading}
            style={{
              marginTop: "10px",
              padding: "10px 20px",
              backgroundColor: "#111827",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {portalLoading
              ? "Ouverture..."
              : "💳 Gérer mon abonnement"}
          </button>
        </div>
      )}

      <br />
      <br />

      <button onClick={logout}>Logout</button>
    </div>
  );
}
