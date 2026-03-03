import React, { useState } from "react";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { ApiRequestError } from "../utils/apiRequestError";
import { Link } from "react-router-dom";

// ✅ AJOUT
import type { StripePortalResponse } from "../api/types";

export default function Billing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth<StripePortalResponse>("/stripe/portal", {
        method: "POST",
      });

      if (!res?.url) {
        setError("URL du portail manquante.");
        return;
      }

      window.location.href = res.url;
    } catch (e) {
      const err = e as ApiRequestError;

      if (err.status === 404) {
        setError("Aucun customer Stripe trouvé. Abonne-toi d’abord via Upgrade.");
      } else {
        setError(err?.message ?? "Impossible d’ouvrir le portail.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-2xl font-black text-slate-900">Billing</h2>
      <p className="text-slate-500 text-sm">
        Gère ton abonnement (paiement, facture, annulation) via Stripe.
      </p>

      {error && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={openPortal}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold uppercase tracking-widest text-xs disabled:opacity-60"
      >
        {loading ? "Ouverture..." : "Ouvrir le portail Billing Stripe"}
      </button>

      <div className="text-xs text-slate-500">
        Pas encore abonné ?{" "}
        <Link className="text-blue-600 font-bold" to="/upgrade">
          Passer PRO
        </Link>
      </div>
    </div>
  );
}