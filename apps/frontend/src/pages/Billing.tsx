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
    <div className="mx-auto max-w-xl space-y-4 text-[var(--theme-text)]">
      <h2 className="text-2xl font-black text-[var(--theme-text)]">Billing</h2>
      <p className="text-sm text-[var(--theme-muted)]">
        Gère ton abonnement (paiement, facture, annulation) via Stripe.
      </p>

      {error && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <button
        onClick={openPortal}
        disabled={loading}
        className="w-full rounded-xl py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--theme-primary)" }}
      >
        {loading ? "Ouverture..." : "Ouvrir le portail Billing Stripe"}
      </button>

      <div className="text-xs text-[var(--theme-muted)]">
        Pas encore abonné ?{" "}
        <Link
          className="font-bold"
          style={{ color: "var(--theme-primary)" }}
          to="/upgrade"
        >
          Passer PRO
        </Link>
      </div>
    </div>
  );
}