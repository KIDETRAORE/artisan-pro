import React from "react";
import { Link } from "react-router-dom";

export default function Cancel() {
  return (
    <div className="mx-auto max-w-xl space-y-4 text-[var(--theme-text)]">
      <h2 className="text-2xl font-black text-[var(--theme-text)]">
        Paiement annulé
      </h2>
      <p className="text-sm text-[var(--theme-muted)]">
        Aucun souci — tu peux relancer l’abonnement quand tu veux.
      </p>

      <div className="flex gap-2">
        <Link
          to="/upgrade"
          className="rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest text-white"
          style={{ backgroundColor: "var(--theme-primary)" }}
        >
          Reprendre l’abonnement
        </Link>
        <Link
          to="/dashboard"
          className="rounded-xl bg-[var(--theme-bg)] px-4 py-3 text-xs font-bold uppercase tracking-widest text-[var(--theme-text)]"
        >
          Retour Dashboard
        </Link>
      </div>
    </div>
  );
}