import React from 'react';
import { Camera, ShieldCheck } from 'lucide-react';

export default function Vision() {
  return (
    // "max-h-full" et "overflow-hidden" pour garantir le zéro-scroll
    <div className="h-full max-w-md mx-auto flex flex-col gap-3 overflow-hidden animate-in fade-in duration-500">
      
      {/* CADRE BASE DE CONNAISSANCE - Version plus compacte */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-emerald-500 text-xs">📄</span>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Base de connaissance externe</span>
        </div>
        <div className="border-2 border-dashed border-slate-50 rounded-xl py-4 flex flex-col items-center justify-center gap-1 text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer group">
           <span className="text-[11px] font-medium italic opacity-60 flex items-center gap-2">
             ☁️ Importer un catalogue (Excel/CSV)
           </span>
        </div>
      </div>

      {/* CADRE SUIVI DE CHANTIER - Taille ajustée pour l'écran unique */}
      <div className="flex-1 bg-white rounded-[2rem] p-6 shadow-sm flex flex-col min-h-0">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">Suivi de Chantier</h2>
          <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-100 uppercase">
            <ShieldCheck size={10} /> IA Vision Expert
          </span>
        </div>
        
        <p className="text-slate-400 text-[12px] leading-snug italic mb-6">
          Prenez une photo. L'IA analyse l'avancement technique et les matériaux sans identifier les personnes.
        </p>

        {/* ZONE DE CAPTURE - Proportionnée pour tenir sans scroller */}
        <div className="flex-1 border-2 border-dashed border-slate-100 rounded-[1.5rem] flex flex-col items-center justify-center group cursor-pointer hover:bg-slate-50 transition-all mb-2">
          <div className="w-14 h-14 bg-white rounded-full shadow-md flex items-center justify-center text-[#4f46e5] mb-3 border border-slate-50 group-hover:scale-105 transition-transform">
            <Camera size={24} />
          </div>
          <span className="font-black text-slate-900 text-[13px] uppercase tracking-wide">Prendre une photo</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Analyse technique instantanée</span>
        </div>
      </div>

    </div>
  );
}