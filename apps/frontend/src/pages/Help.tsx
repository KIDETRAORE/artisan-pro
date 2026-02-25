import React from "react";

export default function Help() {
  const openExpertChat = () => {
    window.dispatchEvent(new Event("openExpertChat"));
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-black text-slate-900">Aide</h2>
      <p className="text-slate-600 mt-2">
        Retrouvez ici l’aide rapide et l’accès au Mode Expert IA.
      </p>

      <div className="mt-6 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Besoin d’un expert ?</h3>
        <p className="text-slate-600 text-sm mt-1">
          Ouvre la bulle “Mode Expert IA” directement.
        </p>

        <button
          onClick={openExpertChat}
          className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:opacity-90"
        >
          Ouvrir le Mode Expert IA
        </button>
      </div>

      <div className="mt-6 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Raccourcis</h3>
        <ul className="mt-3 text-sm text-slate-700 space-y-2 list-disc pl-5">
          <li><b>VISION</b> : suivi photo / analyse</li>
          <li><b>DEVIS</b> : gestion devis</li>
          <li><b>COMPTA</b> : suivi compta</li>
        </ul>
      </div>
    </div>
  );
}