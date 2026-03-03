import React from "react";
import { Link } from "react-router-dom";

export default function Cancel() {
  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-2xl font-black text-slate-900">Paiement annulé</h2>
      <p className="text-slate-600 text-sm">
        Aucun souci — tu peux relancer l’abonnement quand tu veux.
      </p>

      <div className="flex gap-2">
        <Link
          to="/upgrade"
          className="px-4 py-3 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-widest"
        >
          Reprendre l’abonnement
        </Link>
        <Link
          to="/dashboard"
          className="px-4 py-3 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs uppercase tracking-widest"
        >
          Retour Dashboard
        </Link>
      </div>
    </div>
  );
}