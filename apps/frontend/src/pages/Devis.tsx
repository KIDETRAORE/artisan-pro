import React, { useState, useRef } from 'react';
// Ajout de FileText dans les imports ci-dessous
import { Mic, CloudUpload, Loader2, CheckCircle2, User, Square, Trash2, FileText, AlertTriangle } from 'lucide-react';
import { Link } from "react-router-dom";
import { fetchWithAuth } from '../auth/fetchWithAuth';
import { ApiError } from "../auth/ApiError";

type UiError =
  | { kind: "quota"; message: string }
  | { kind: "rate"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "generic"; message: string };

function toUiError(err: unknown): UiError {
  if (err instanceof ApiError) {
    // ✅ Quota atteint
    if (err.status === 403 && err.code === "quota_exceeded") {
      return {
        kind: "quota",
        message: err.message || "Quota atteint. Passe au plan PRO pour continuer.",
      };
    }

    // ✅ Trop de requêtes
    if (err.status === 429 || err.code === "rate_limited") {
      return {
        kind: "rate",
        message: "Trop de requêtes. Réessaie dans quelques secondes.",
      };
    }

    return { kind: "generic", message: err.message || "Erreur serveur." };
  }

  // ✅ Timeout / réseau
  if (err instanceof Error) {
    const msg = err.message || "";
    if (/timeout/i.test(msg) || /Failed to fetch/i.test(msg)) {
      return {
        kind: "timeout",
        message:
          "Connexion instable ou délai dépassé. Vérifie ton réseau et réessaie.",
      };
    }
    return { kind: "generic", message: msg };
  }

  return { kind: "generic", message: "Une erreur est survenue." };
}

export default function Devis() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [uiError, setUiError] = useState<UiError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs pour le micro
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // --- 1. POLLING DU STATUT ---
  const startPolling = (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const data = await fetchWithAuth<any>(`/ai/status/${jobId}`);

        if (data.status === 'completed') {
          clearInterval(pollInterval);
          let finalData = data.result;

          // Nettoyage JSON si nécessaire
          if (typeof finalData === 'string') {
            const match = finalData.match(/\{[\s\S]*\}/);
            finalData = match ? JSON.parse(match[0]) : JSON.parse(finalData);
          }

          setAnalysisResult(finalData);
          setIsProcessing(false);
          setUiError(null);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          setIsProcessing(false);
          // ✅ plus de alert(...)
          setUiError({ kind: "generic", message: "L'analyse a échoué." });
        }
      } catch (err) {
        clearInterval(pollInterval);
        setIsProcessing(false);
        setUiError(toUiError(err));
      }
    }, 2000);
  };

  // --- 2. LOGIQUE DU MICRO ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);
      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/mp3' });
        await sendToAI(audioBlob, 'vocal');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setUiError(null);
    } catch (_err) {
      // ✅ plus de alert(...)
      setUiError({ kind: "generic", message: "Accès micro refusé ou non disponible." });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  // --- 3. ENVOI À L'IA (Image ou Audio) ---
  const sendToAI = async (file: File | Blob, typeOverride?: string) => {
    setIsProcessing(true);
    setAnalysisResult(null);
    setUiError(null);

    try {
      const formData = new FormData();
      // On ajoute le fichier (qu'il vienne de l'input ou du micro)
      formData.append('file', file, typeOverride === 'vocal' ? 'capture.mp3' : 'image.jpg');

      // On détermine le type pour le backend
      const finalType = typeOverride || (file.type.startsWith('audio') ? 'vocal' : 'vision');
      formData.append('type', finalType);

      const data = await fetchWithAuth<{ jobId?: string }>(`/ai/run`, {
        method: 'POST',
        body: formData,
      });

      if (data.jobId) startPolling(data.jobId);
    } catch (err) {
      // ✅ plus de alert(...)
      setUiError(toUiError(err));
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-full max-w-md mx-auto flex flex-col gap-3 p-4">

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && sendToAI(e.target.files[0])}
        className="hidden"
        accept="image/*,audio/*"
      />

      {/* ZONE D'UPLOAD */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-emerald-500 text-xs">📂</span>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Analyse de documents</span>
        </div>

        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl py-6 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer
            ${isProcessing ? 'bg-slate-50 border-blue-200' : 'border-slate-100 hover:bg-slate-50 hover:border-slate-300'}
          `}
        >
          {isProcessing ? (
            <span className="text-[11px] font-medium text-blue-500 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Analyse en cours...
            </span>
          ) : (
            <span className="text-[11px] font-medium italic text-slate-400 flex items-center gap-2">
              <CloudUpload size={16} /> Photo ou fichier audio
            </span>
          )}
        </div>
      </div>

      {/* ZONE DE RÉSULTAT OU DESIGN VOCAL */}
      <div className="flex-1 bg-white rounded-[2rem] p-6 shadow-sm flex flex-col min-h-0 overflow-y-auto relative">

        {/* ✅ BANNERS ERREUR (quota / 429 / timeout / generic) */}
        {uiError && (
          <div
            className={[
              "mb-4 p-3 rounded-2xl border text-[11px] leading-snug",
              uiError.kind === "quota"
                ? "bg-amber-50 border-amber-100 text-amber-900"
                : uiError.kind === "rate"
                ? "bg-blue-50 border-blue-100 text-blue-900"
                : uiError.kind === "timeout"
                ? "bg-slate-50 border-slate-100 text-slate-800"
                : "bg-red-50 border-red-100 text-red-900",
            ].join(" ")}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-black uppercase tracking-widest text-[9px] opacity-70">
                  {uiError.kind === "quota"
                    ? "Quota atteint"
                    : uiError.kind === "rate"
                    ? "Trop de requêtes"
                    : uiError.kind === "timeout"
                    ? "Délai dépassé"
                    : "Erreur"}
                </div>
                <div className="mt-1">{uiError.message}</div>

                {uiError.kind === "quota" && (
                  <div className="mt-2">
                    <Link
                      to="/upgrade"
                      className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                    >
                      Passer PRO
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {analysisResult ? (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b pb-2">Analyse Terminée</h2>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-500"><User size={18} /></div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Client</p>
                  <p className="font-bold text-slate-800">{analysisResult.clientName || "Non identifié"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total HT</p>
                  <p className="text-lg font-black text-slate-900">{analysisResult.totalHT || "0"} €</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase">Total TTC</p>
                  <p className="text-lg font-black text-emerald-600">{analysisResult.totalTTC || "0"} €</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Prestations</p>
                {analysisResult.items?.map((item: any, idx: number) => (
                  <div key={idx} className="text-[11px] bg-slate-50 p-2 rounded-lg flex justify-between border border-slate-100">
                    <span className="text-slate-600 font-medium">{item.description}</span>
                    <span className="font-bold text-slate-900">{item.price}€</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setAnalysisResult(null);
                setUiError(null);
              }}
              className="w-full py-3 bg-slate-900 text-white rounded-xl text-[11px] font-bold uppercase mt-4"
            >
              Nouveau Devis
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-between py-4">
            <h2 className="text-lg font-black text-slate-900 uppercase">Note Vocale</h2>

            <div className="flex flex-col items-center gap-6">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`w-32 h-32 rounded-full flex items-center justify-center border-8 border-slate-50 shadow-2xl transition-all active:scale-95
                  ${isRecording ? 'bg-red-500 text-white animate-pulse border-red-100' :
                    isProcessing ? 'bg-slate-100 text-slate-300' : 'bg-blue-600 text-white hover:bg-blue-700'}
                `}
              >
                {isProcessing ? <Loader2 size={48} className="animate-spin" /> :
                  isRecording ? <Square size={48} fill="white" /> : <Mic size={48} />}
              </button>

              <div className="text-center">
                <p className="font-black text-slate-900 text-[13px] uppercase">
                  {isRecording ? "Enregistrement..." : isProcessing ? "Analyse en cours..." : "Appuyez pour parler"}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase italic mt-1">
                  Dictez les travaux, l'IA s'occupe du reste
                </p>
              </div>
            </div>

            {/* BARRE D'ICÔNES CORRIGÉE */}
            <div className="w-full pt-4 border-t border-slate-50 flex justify-around opacity-30">
              <div className="flex flex-col items-center gap-1"><User size={16} /><span className="text-[7px] font-bold uppercase">Client</span></div>
              <div className="flex flex-col items-center gap-1"><FileText size={16} /><span className="text-[7px] font-bold uppercase">Devis</span></div>
              <div className="flex flex-col items-center gap-1"><Trash2 size={16} /><span className="text-[7px] font-bold uppercase">Reset</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}