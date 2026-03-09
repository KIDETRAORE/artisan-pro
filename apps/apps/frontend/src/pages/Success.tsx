// apps/frontend/src/pages/Success.tsx

import React from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function Success() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  return (
    <div className="mx-auto max-w-xl space-y-4 text-[var(--theme-text)]">
      <h2 className="text-2xl font-black text-[var(--theme-text)]">
        Paiement confirmé ✅
      </h2>

      <p className="text-sm text-[var(--theme-muted)]">
        Ton abonnement Stripe a été démarré. Le webhook va synchroniser ton plan PRO.
      </p>

      {sessionId && (
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 text-xs font-mono text-[var(--theme-text)]">
          session_id: {sessionId}
        </div>
      )}

      <div className="flex gap-2">
        <Link
          to="/dashboard"
          className="rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest text-white"
          style={{ backgroundColor: "var(--theme-primary)" }}
        >
          Retour Dashboard
        </Link>

        <Link
          to="/billing"
          className="rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest text-white"
          style={{ backgroundColor: "var(--theme-primary)" }}
        >
          Ouvrir Billing
        </Link>
      </div>

      <p className="text-xs text-[var(--theme-muted)]">
        Si ton plan n’apparaît pas immédiatement, rafraîchis le dashboard (le webhook peut prendre quelques secondes).
      </p>
    </div>
  );
}