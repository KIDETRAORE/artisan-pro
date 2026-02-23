import React, { useState, useRef } from 'react';
import { Camera, ShieldCheck, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Eye } from 'lucide-react';
import { useAuth } from '../store/auth.store';

const API_URL = "http://localhost:8080/ai";

export default function Vision() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { accessToken } = useAuth();

  // --- POLLING DU STATUT ---
  const startPolling = (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/status/${jobId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(pollInterval);
          let result = data.result;
          // Nettoyage JSON si Gemini ajoute du texte
          if (typeof result === 'string') {
            const match = result.match(/\{[\s\S]*\}/);
            result = match ? JSON.parse(match[0]) : JSON.parse(result);
          }
          setAnalysis(result);
          setIsProcessing(false);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          setIsProcessing(false);
          alert("L'analyse a échoué.");
        }
      } catch (err) {
        console.error("Erreur polling:", err);
      }
    }, 2000);
  };

  // --- ENVOI DE LA PHOTO ---
  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setAnalysis(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'vision');

    try {
      const response = await fetch(`${API_URL}/run`, {
        method: 'POST',
        body: formData,
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (data.jobId) startPolling(data.jobId);
    } catch (err) {
      alert("Erreur de connexion au serveur.");
      setIsProcessing(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-full max-w-md mx-auto flex flex-col gap-3 overflow-hidden animate-in fade-in duration-500">
      
      {/* INPUT CACHÉ */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handlePhoto} 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
      />

      {/* CADRE BASE DE CONNAISSANCE */}
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

      {/* CADRE SUIVI DE CHANTIER / RÉSULTATS */}
      <div className="flex-1 bg-white rounded-[2rem] p-6 shadow-sm flex flex-col min-h-0 overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">Suivi de Chantier</h2>
          <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-100 uppercase">
            <ShieldCheck size={10} /> IA Vision Expert
          </span>
        </div>
        
        {!analysis ? (
          <>
            <p className="text-slate-400 text-[12px] leading-snug italic mb-6">
              Prenez une photo. L'IA analyse l'avancement technique et les matériaux sans identifier les personnes.
            </p>

            <div 
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className="flex-1 border-2 border-dashed border-slate-100 rounded-[1.5rem] flex flex-col items-center justify-center group cursor-pointer hover:bg-slate-50 transition-all mb-2 min-h-[200px]"
            >
              {isProcessing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-12 h-12 text-[#4f46e5] animate-spin" />
                  <span className="text-[11px] font-bold text-blue-500 uppercase animate-pulse">Analyse technique...</span>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 bg-white rounded-full shadow-md flex items-center justify-center text-[#4f46e5] mb-3 border border-slate-50 group-hover:scale-105 transition-transform">
                    <Camera size={24} />
                  </div>
                  <span className="font-black text-slate-900 text-[13px] uppercase tracking-wide">Prendre une photo</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Analyse instantanée</span>
                </>
              )}
            </div>
          </>
        ) : (
          /* --- AFFICHAGE DES RÉSULTATS D'ANALYSE --- */
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
            {/* ÉLÉMENTS VISIBLES */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-blue-500" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Matériaux & Éléments</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.elements_visibles?.map((el: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-md border border-slate-200 uppercase">
                    {el}
                  </span>
                ))}
              </div>
            </div>

            {/* ANOMALIES */}
            {analysis.anomalies?.length > 0 && (
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-red-500" />
                  <span className="text-[10px] font-black text-red-600 uppercase">Points de vigilance</span>
                </div>
                <ul className="space-y-1">
                  {analysis.anomalies.map((ano: string, i: number) => (
                    <li key={i} className="text-[11px] text-red-800 leading-tight">• {ano}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* RECOMMANDATIONS */}
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb size={16} className="text-emerald-600" />
                <span className="text-[10px] font-black text-emerald-600 uppercase">Recommandations</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                {analysis.recommandations?.[0] || "Installation conforme aux premières observations."}
              </p>
            </div>

            <button 
              onClick={() => setAnalysis(null)}
              className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest"
            >
              Nouvelle Inspection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}