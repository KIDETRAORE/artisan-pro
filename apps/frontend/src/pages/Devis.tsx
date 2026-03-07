// apps/frontend/src/pages/Devis.tsx
import React, { useState, useRef, useEffect } from "react";
import { toast } from "react-hot-toast";
import {
  Mic,
  CloudUpload,
  Loader2,
  User,
  Square,
  Trash2,
  FileText,
} from "lucide-react";
import { useAuth } from "../store/auth.store";
import { ApiRequestError, toApiRequestError } from "../utils/apiRequestError";

// ✅ AJOUT
import type { AiRunResponse } from "../api/types";

const API_URL = "http://localhost:8080/ai";

export default function Devis() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs pour le micro
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const { accessToken } = useAuth();

  // ✅ Anti multi-poll + cleanup
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, []);

  const clearPoll = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    isPollingRef.current = false;
  };

  // --- 1. POLLING DU STATUT ---
  const startPolling = (jobId: string) => {
    // ✅ Stop ancien poll si existant
    clearPoll();

    // ✅ Empêcher multi-poll
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    // ✅ Backoff 429 : 1s → 2s → 4s → 8s → 10s (max)
    let delayMs = 1000;
    const maxDelayMs = 10000;

    const tick = async () => {
      try {
        const response = await fetch(`${API_URL}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          throw await toApiRequestError(response);
        }

        const data = await response.json();

        if (data.status === "completed") {
          clearPoll();

          let finalData = data.result;

          // Nettoyage JSON si nécessaire
          if (typeof finalData === "string") {
            const match = finalData.match(/\{[\s\S]*\}/);
            finalData = match ? JSON.parse(match[0]) : JSON.parse(finalData);
          }

          setAnalysisResult(finalData);
          setIsProcessing(false);
        } else if (data.status === "failed") {
          clearPoll();
          setIsProcessing(false);
          toast.error(data.error || "L'analyse a échoué.");
        }
      } catch (e) {
        const err = e as ApiRequestError;

        // ✅ 429 backoff
        if (err.code === "too_many_requests") {
          clearPoll();
          delayMs = Math.min(maxDelayMs, delayMs * 2);
          isPollingRef.current = true;
          pollIntervalRef.current = setInterval(tick, delayMs);
          return;
        }

        clearPoll();
        setIsProcessing(false);
        toast.error(err.message || "Erreur de suivi du job.");
      }
    };

    // Démarrage immédiat, puis interval
    tick();
    pollIntervalRef.current = setInterval(tick, delayMs);
  };

  // --- 2. LOGIQUE DU MICRO ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) =>
        audioChunks.current.push(e.data);
      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/mp3" });
        await sendToAI(audioBlob, "vocal");
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch {
      toast.error("Accès micro refusé ou non disponible.");
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

    // ✅ stop ancien poll si existant
    clearPoll();

    try {
      const formData = new FormData();

      formData.append(
        "file",
        file,
        typeOverride === "vocal" ? "capture.mp3" : "image.jpg"
      );

      const finalType =
        typeOverride || (file.type.startsWith("audio") ? "vocal" : "vision");
      formData.append("type", finalType);

      const response = await fetch(`${API_URL}/run`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw await toApiRequestError(response);
      }

      // ✅ MODIF: typer la réponse /ai/run
      const data = (await response.json()) as AiRunResponse;
      if (data.jobId) startPolling(data.jobId);
    } catch (e) {
      const err = e as ApiRequestError;

      toast.error(err.message || "Erreur de connexion.");
      setIsProcessing(false);
      clearPoll();
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
      <div className="bg-[var(--theme-card)] rounded-2xl p-4 border border-[var(--theme-border)] shadow-sm shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-emerald-500 text-xs">📂</span>
          <span className="text-[9px] font-black text-[var(--theme-muted)] uppercase tracking-widest">
            Analyse de documents
          </span>
        </div>

        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl py-6 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer
            ${
              isProcessing
                ? "bg-[var(--theme-bg)] border-blue-200"
                : "border-[var(--theme-border)] hover:bg-[var(--theme-bg)] hover:border-[var(--theme-border)]"
            }
          `}
        >
          {isProcessing ? (
            <span className="text-[11px] font-medium text-blue-500 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Analyse en cours...
            </span>
          ) : (
            <span className="text-[11px] font-medium italic text-[var(--theme-muted)] flex items-center gap-2">
              <CloudUpload size={16} /> Photo ou fichier audio
            </span>
          )}
        </div>
      </div>

      {/* ZONE DE RÉSULTAT OU DESIGN VOCAL */}
      <div className="flex-1 bg-[var(--theme-card)] rounded-[2rem] p-6 shadow-sm flex flex-col min-h-0 overflow-y-auto relative">
        {analysisResult ? (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-sm font-black text-[var(--theme-text)] uppercase tracking-widest border-b pb-2">
              Analyse Terminée
            </h2>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-500">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[var(--theme-muted)] uppercase">
                    Client
                  </p>
                  <p className="font-bold text-[var(--theme-text)]">
                    {analysisResult.clientName || "Non identifié"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--theme-bg)] rounded-xl">
                  <p className="text-[10px] font-bold text-[var(--theme-muted)] uppercase">
                    Total HT
                  </p>
                  <p className="text-lg font-black text-[var(--theme-text)]">
                    {analysisResult.totalHT || "0"} €
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase">
                    Total TTC
                  </p>
                  <p className="text-lg font-black text-emerald-600">
                    {analysisResult.totalTTC || "0"} €
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[var(--theme-muted)] uppercase">
                  Prestations
                </p>
                {analysisResult.items?.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="text-[11px] bg-[var(--theme-bg)] p-2 rounded-lg flex justify-between border border-[var(--theme-border)]"
                  >
                    <span className="text-[var(--theme-muted)] font-medium">
                      {item.description}
                    </span>
                    <span className="font-bold text-[var(--theme-text)]">
                      {item.price}€
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setAnalysisResult(null)}
              className="w-full py-3 bg-[var(--theme-primary)] text-white rounded-xl text-[11px] font-bold uppercase mt-4"
            >
              Nouveau Devis
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-between py-4">
            <h2 className="text-lg font-black text-[var(--theme-text)] uppercase">
              Note Vocale
            </h2>

            <div className="flex flex-col items-center gap-6">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`w-32 h-32 rounded-full flex items-center justify-center border-8 border-[var(--theme-border)] shadow-2xl transition-all active:scale-95
                  ${
                    isRecording
                      ? "bg-red-500 text-white animate-pulse border-red-100"
                      : isProcessing
                      ? "bg-[var(--theme-bg)] text-[var(--theme-muted)]"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }
                `}
              >
                {isProcessing ? (
                  <Loader2 size={48} className="animate-spin" />
                ) : isRecording ? (
                  <Square size={48} fill="white" />
                ) : (
                  <Mic size={48} />
                )}
              </button>

              <div className="text-center">
                <p className="font-black text-[var(--theme-text)] text-[13px] uppercase">
                  {isRecording
                    ? "Enregistrement..."
                    : isProcessing
                    ? "Analyse en cours..."
                    : "Appuyez pour parler"}
                </p>
                <p className="text-[10px] text-[var(--theme-muted)] font-bold uppercase italic mt-1">
                  Dictez les travaux, l'IA s'occupe du reste
                </p>
              </div>
            </div>

            {/* BARRE D'ICÔNES CORRIGÉE */}
            <div className="w-full pt-4 border-t border-[var(--theme-border)] flex justify-around opacity-30">
              <div className="flex flex-col items-center gap-1">
                <User size={16} />
                <span className="text-[7px] font-bold uppercase">Client</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <FileText size={16} />
                <span className="text-[7px] font-bold uppercase">Devis</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Trash2 size={16} />
                <span className="text-[7px] font-bold uppercase">Reset</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
