import React from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function Success() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-2xl font-black text-slate-900">Paiement confirmé ✅</h2>
      <p className="text-slate-600 text-sm">
        Ton abonnement Stripe a été démarré. Le webhook va synchroniser ton plan PRO.
      </p>

      {sessionId && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 text-xs font-mono">
          session_id: {sessionId}
        </div>
      )}

      <div className="flex gap-2">
        <Link
          to="/dashboard"
          className="px-4 py-3 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-widest"
        >
          Retour Dashboard
        </Link>
        <Link
          to="/billing"
          className="px-4 py-3 rounded-xl bg-blue-600 text-white font-bold text-xs uppercase tracking-widest"
        >
          Ouvrir Billing
        </Link>
      </div>

      <p className="text-xs text-slate-500">
        Si ton plan n’apparaît pas immédiatement, rafraîchis le dashboard (le webhook peut prendre quelques secondes).
      </p>
    </div>
  );
}