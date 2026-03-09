// apps/frontend/src/pages/Upgrade.tsx

import React, { useState } from "react";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { ApiRequestError } from "../utils/apiRequestError";
import { Link } from "react-router-dom";
import { useUser } from "../context/user.context";

// ✅ AJOUT
import type { StripeCheckoutResponse } from "../api/types";

export default function Upgrade() {
  const { userData } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = userData?.plan ?? "free";

  const startCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth<StripeCheckoutResponse>(
        "/stripe/create-checkout-session",
        { method: "POST" }
      );

      if (!res?.url) {
        setError("URL de paiement manquante.");
        return;
      }

      window.location.href = res.url;
    } catch (e) {
      const err = e as ApiRequestError;
      setError(err?.message ?? "Impossible de démarrer le paiement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 text-[var(--theme-text)]">
      <h2 className="text-2xl font-black text-[var(--theme-text)]">
        Passer au plan PRO
      </h2>

      <p className="text-sm text-[var(--theme-muted)]">
        Plan actuel : <span className="font-bold">{plan}</span>
      </p>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={startCheckout}
        disabled={loading}
        className="w-full rounded-xl py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--theme-primary)" }}
      >
        {loading ? "Redirection..." : "S'abonner (Checkout Stripe)"}
      </button>

      <div className="text-xs text-[var(--theme-muted)]">
        Déjà PRO ?{" "}
        <Link
          to="/billing"
          className="font-bold"
          style={{ color: "var(--theme-primary)" }}
        >
          Ouvrir le portail Billing
        </Link>
      </div>
    </div>
  );
}