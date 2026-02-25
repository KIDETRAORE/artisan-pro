import React, { useState } from "react";
import { useUser } from "../context/user.context";

export default function Settings() {
  const { userData, setUserData } = useUser();
  const [name, setName] = useState(userData?.name ?? "");
  const [email, setEmail] = useState(userData?.email ?? "");

  const save = () => {
    // Pour l’instant: “fonctionnel” côté UI.
    // Si tu veux persister en backend, on branchera un endpoint ensuite.
    setUserData({
      ...(userData ?? {}),
      name,
      email,
      plan: userData?.plan ?? "FREE",
      quota: userData?.quota,
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-black text-slate-900">Réglages</h2>
      <p className="text-slate-600 mt-2">
        Paramètres de profil (UI prête). Persistance backend à brancher si besoin.
      </p>

      <div className="mt-6 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <label className="block text-sm font-bold text-slate-900">
          Nom
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2"
          placeholder="Ton nom"
        />

        <label className="block text-sm font-bold text-slate-900 mt-4">
          Email
        </label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2"
          placeholder="Ton email"
        />

        <button
          onClick={save}
          className="mt-5 px-4 py-2 rounded-xl bg-[#2563eb] text-white font-bold hover:opacity-90"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}