import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // 1. Import pour la redirection
import { FileBarChart, CloudUpload, Loader2, TrendingUp, TrendingDown, ReceiptEuro, CheckCircle2, Sparkles } from 'lucide-react';
import { useAuth } from '../store/auth.store';

const API_URL = "http://localhost:8080/ai";

export default function Compta() {
  const navigate = useNavigate(); // 2. Initialisation du hook de navigation
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { accessToken } = useAuth();

  // --- 1. FONCTION MODE EXPERT (Redirection + Event) ---
  const handleExpertChat = () => {
    if (!report) return;

    // A. On redirige d'abord vers la page Assistant
    navigate('/assistant');

    // B. On envoie l'événement après un court délai pour laisser la page Assistant se charger
    setTimeout(() => {
      const event = new CustomEvent('openExpertChat', { 
        detail: { 
          analysisData: report,
          message: `Analyse expert activée ! Je vois un bénéfice de ${report.resultat_net}€. Comment puis-je t'aider à optimiser ta gestion ou tes prochains chantiers ?`
        } 
      });
      window.dispatchEvent(event);
    }, 150); // 150ms est idéal pour le montage du composant
  };

  // --- 2. POLLING (Attente du résultat) ---
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
          if (typeof result === 'string') {
            const match = result.match(/\{[\s\S]*\}/);
            result = match ? JSON.parse(match[0]) : JSON.parse(result);
          }
          setReport(result);
          setIsProcessing(false);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          setIsProcessing(false);
          alert("L'analyse comptable a échoué.");
        }
      } catch (err) {
        console.error("Erreur polling:", err);
      }
    }, 2000);
  };

  // --- 3. GESTION DE L'UPLOAD ---
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setReport(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'compta');

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
    }
  };

  return (
    <div className="h-full w-full max-w-md mx-auto overflow-y-auto px-4 pt-4 pb-24 scroll-smooth animate-in fade-in duration-500">
      
      {/* CADRE BASE DE CONNAISSANCE */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-emerald-500 font-bold">📊</span>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base de connaissance externe</span>
        </div>
        <div 
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-100 rounded-2xl py-6 flex flex-col items-center justify-center gap-2 text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*,.csv,.xlsx,application/pdf" />
          {isProcessing ? (
            <Loader2 className="animate-spin text-blue-500" size={20} />
          ) : (
            <CloudUpload size={20} className="opacity-40" />
          )}
          <span className="text-xs font-bold italic text-center px-4 text-slate-500">
            {isProcessing ? "Calculs IA en cours..." : "Scanner facture ou relevé"}
          </span>
        </div>
      </div>

      {/* ZONE D'AFFICHAGE DYNAMIQUE */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm flex flex-col min-h-[400px]">
        
        {!report ? (
          <div className="flex-1 flex flex-col items-center text-center justify-center py-10">
            <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mb-8 border border-slate-100">
              <FileBarChart size={40} />
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase mb-3">
              Comptabilité IA
            </h2>
            <p className="text-slate-400 text-[13px] leading-relaxed italic max-w-[280px]">
              Importez vos documents pour générer un bilan de santé et extraire la TVA automatiquement.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Analyse Terminée</h2>
              <CheckCircle2 className="text-emerald-500" size={18} />
            </div>

            {/* BÉNÉFICE NET */}
            <div className="bg-slate-900 rounded-3xl p-6 text-center text-white shadow-xl">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Résultat Net Estimé</p>
              <p className="text-3xl font-black text-emerald-400">{report.resultat_net || 0} €</p>
            </div>

            {/* GRID RECETTES / DEPENSES */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-600 mb-1">
                  <TrendingUp size={14} />
                  <span className="text-[9px] font-black uppercase">Recettes</span>
                </div>
                <p className="text-lg font-bold text-slate-900">{report.total_recettes || 0} €</p>
              </div>
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                <div className="flex items-center gap-2 text-red-600 mb-1">
                  <TrendingDown size={14} />
                  <span className="text-[9px] font-black uppercase">Dépenses</span>
                </div>
                <p className="text-lg font-bold text-slate-900">{report.total_depenses || 0} €</p>
              </div>
            </div>

            {/* SYNTHÈSE TVA */}
            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  <ReceiptEuro size={18} />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">TVA Solde</p>
                  <p className="font-bold text-blue-900">
                    {((report.tva_collectee || 0) - (report.tva_deductible || 0)).toFixed(2)} €
                  </p>
                </div>
              </div>
            </div>

            {/* RÉSUMÉ IA */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-[11px] text-slate-600 leading-relaxed">
              "{report.summary || "Analyse effectuée avec succès."}"
            </div>

            {/* BOUTON MODE EXPERT AI */}
            <button 
              onClick={handleExpertChat}
              className="w-full py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 active:scale-95"
            >
              <Sparkles size={14} /> Mode Expert AI
            </button>

            <button 
              onClick={() => setReport(null)}
              className="w-full py-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest hover:text-slate-600 transition-all"
            >
              Nouvelle Analyse
            </button>
          </div>
        )}
      </div>
    </div>
  );
}