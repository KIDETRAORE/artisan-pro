import React, { useState } from "react";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { ApiError } from "../auth/ApiError";
import { Link } from "react-router-dom";
import { useUser } from "../context/user.context";

export default function Upgrade() {
  const { userData } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = userData?.plan ?? "FREE";

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth<{ success: boolean; url?: string }>("/stripe/create-checkout-session", {
        method: "POST",
      });

      if (!res?.url) throw new Error("URL de paiement manquante");
      window.location.href = res.url;
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message ?? "Impossible de démarrer le paiement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-2xl font-black text-slate-900">Passer au plan PRO</h2>
      <p className="text-slate-500 text-sm">
        Plan actuel : <span className="font-bold">{plan}</span>
      </p>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={startCheckout}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold uppercase tracking-widest text-xs disabled:opacity-60"
      >
        {loading ? "Redirection..." : "S'abonner (Checkout Stripe)"}
      </button>

      <div className="text-xs text-slate-500">
        Déjà PRO ? <Link className="text-blue-600 font-bold" to="/billing">Ouvrir le portail Billing</Link>
      </div>
    </div>
  );
}