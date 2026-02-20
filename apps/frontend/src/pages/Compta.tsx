import React from 'react';
import { FileBarChart, CloudUpload } from 'lucide-react';

export default function Compta() {
  return (
    <div className="space-y-4 max-w-md mx-auto animate-in fade-in duration-500">
      
      {/* CADRE BASE DE CONNAISSANCE */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-emerald-500 font-bold">📊</span>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base de connaissance externe</span>
        </div>
        <div className="border-2 border-dashed border-slate-100 rounded-2xl py-6 flex flex-col items-center justify-center gap-2 text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer">
           <CloudUpload size={20} className="opacity-40" />
           <span className="text-xs font-bold italic">Importer un catalogue (Excel/CSV)</span>
        </div>
      </div>

      {/* CADRE COMPTABILITÉ IMPORTÉE */}
      <div className="bg-white rounded-[2.5rem] p-12 shadow-sm flex flex-col items-center text-center min-h-[400px] justify-center">
        
        {/* ICÔNE CENTRALE GRISÉE */}
        <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mb-8 border border-slate-100">
          <FileBarChart size={40} />
        </div>

        <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase mb-3">
          Comptabilité Importée
        </h2>

        <p className="text-slate-400 text-[13px] leading-relaxed italic max-w-[280px]">
          Glissez votre catalogue ou vos extraits bancaires pour générer votre bilan de santé et détecter les impayés.
        </p>
      </div>
    </div>
  );
}