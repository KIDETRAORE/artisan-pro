import React from 'react';
import { Mic, CloudUpload } from 'lucide-react';

export default function Devis() {
  return (
    // "h-full" et "overflow-hidden" pour verrouiller la vue sans scroll
    <div className="h-full max-w-md mx-auto flex flex-col gap-3 overflow-hidden animate-in fade-in duration-500">
      
      {/* CADRE BASE DE CONNAISSANCE - Format Compact */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-emerald-500 text-xs font-bold">📊</span>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Base de connaissance externe</span>
        </div>
        <div className="border-2 border-dashed border-slate-50 rounded-xl py-4 flex flex-col items-center justify-center gap-1 text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer group">
           <span className="text-[11px] font-medium italic opacity-60 flex items-center gap-2">
             <CloudUpload size={14} /> Importer un catalogue (Excel/CSV)
           </span>
        </div>
      </div>

      {/* CADRE NOUVEAU DEVIS VOCAL - Proportionné pour l'écran */}
      <div className="flex-1 bg-white rounded-[2rem] p-6 shadow-sm flex flex-col items-center justify-between min-h-0">
        <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase text-center mt-2">
          Nouveau Devis Vocal
        </h2>

        {/* BOUTON MICRO BLEU - Taille ajustée pour l'équilibre visuel sans scroll */}
        <div className="flex-1 flex items-center justify-center w-full">
          <button className="w-28 h-28 bg-[#2563eb] rounded-full flex items-center justify-center text-white shadow-[0_15px_40px_rgba(37,99,235,0.25)] hover:scale-105 active:scale-95 transition-all group border-4 border-white">
            <Mic size={40} strokeWidth={2.5} className="group-hover:animate-pulse" />
          </button>
        </div>

        <div className="text-center pb-4">
          <p className="font-black text-slate-900 text-[13px] uppercase tracking-wide">
            Appuyez pour dicter
          </p>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic mt-0.5">
            Décrivez vos travaux morceau par morceau
          </p>
        </div>
      </div>
      
    </div>
  );
}