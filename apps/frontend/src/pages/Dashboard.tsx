import { useEffect, useState } from "react";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { useAuth } from "../store/auth.store";
import { useNavigate } from "react-router-dom";

type DashboardResponse = {
  message: string;
  user: {
    id: string;
    email: string;
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

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth("/dashboard")
      .then(async (res) => {
        if (res.status === 401) {
          await logout();
          navigate("/login");
          return;
        }

        if (!res.ok) {
          throw new Error("Erreur lors du chargement du dashboard");
        }

        const json = await res.json();
        setData(json);
      })
      .catch((err) => {
        console.error(err);
        setError("Impossible de charger le dashboard");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [logout, navigate]);

  if (loading) {
    return <p>Chargement du dashboard...</p>;
  }

  if (error) {
    return <p>{error}</p>;
  }

  if (!data) {
    return null;
  }

  return (
    <div>
      <h1>Dashboard</h1>

      <p>{data.message}</p>

      <p>
        Connecté en tant que <strong>{data.user.email}</strong>
      </p>

      <h3>Fonctionnalités</h3>
      <ul>
        <li>Génération devis : {data.features.generate ? "✅" : "❌"}</li>
        <li>Analyse : {data.features.analyze ? "✅" : "❌"}</li>
        <li>Historique : {data.features.history ? "✅" : "❌"}</li>
      </ul>

      <button onClick={logout}>Logout</button>
    </div>
  );
}
