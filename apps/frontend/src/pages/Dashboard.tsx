import { useEffect, useState } from "react";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { useAuth } from "../store/auth.store";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "../context/user.context";

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
  quota?: {
    used: number;
    limit: number;
  };
};

export default function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUserData } = useUser();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const json = await fetchWithAuth<DashboardResponse>("/dashboard");
      setData(json);

      // 🔥 Injection globale dans le header
      setUserData({
        plan: json.user.plan ?? "FREE",
        quota: json.quota,
      });

    } catch (err: any) {
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

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      loadDashboard();
      navigate("/dashboard", { replace: true });
    }
  }, [searchParams]);

  const handleUpgrade = async () => {
    try {
      setUpgradeLoading(true);
      const json = await fetchWithAuth<{ url: string }>(
        "/stripe/create-checkout-session",
        { method: "POST" }
      );
      if (json.url) window.location.href = json.url;
    } catch (err: any) {
      alert(err.message || "Impossible de lancer le paiement");
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const json = await fetchWithAuth<{ url: string }>(
        "/stripe/portal",
        { method: "POST" }
      );
      if (json.url) window.location.href = json.url;
    } catch (err: any) {
      alert(err.message || "Impossible d'ouvrir le portail");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <div className="text-gray-500">Chargement...</div>;
  if (error) return <div className="text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h2 className="text-lg font-semibold mb-2">{data.message}</h2>
        <p className="text-gray-600">
          Connecté en tant que{" "}
          <span className="font-medium">{data.user.email}</span>
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">
          Fonctionnalités disponibles
        </h3>

        <ul className="space-y-2 text-gray-700">
          <li>📄 Génération devis : {data.features.generate ? "✅" : "❌"}</li>
          <li>📊 Analyse : {data.features.analyze ? "✅" : "❌"}</li>
          <li>🕓 Historique : {data.features.history ? "✅" : "❌"}</li>
        </ul>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border">
        {data.user.plan !== "PRO" ? (
          <button
            onClick={handleUpgrade}
            disabled={upgradeLoading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition disabled:opacity-50"
          >
            {upgradeLoading ? "Redirection..." : "🚀 Passer en PRO"}
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-green-600 font-medium">
              ✅ Vous êtes en plan PRO
            </p>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-lg transition disabled:opacity-50"
            >
              {portalLoading ? "Ouverture..." : "💳 Gérer mon abonnement"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
