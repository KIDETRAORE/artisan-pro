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
import type { AiRunResponse } from "../api/types";
import { fetchWithAuth } from "../auth/fetchWithAuth";

const API_URL = "http://localhost:8080/ai";

type DevisAnalysisItem = {
  description?: string;
  price?: number | string;
};

type DevisAnalysisResult = {
  clientName?: string;
  totalHT?: number | string;
  totalTTC?: number | string;
  items?: DevisAnalysisItem[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeDevisAnalysisResult(value: unknown): DevisAnalysisResult | null {
  if (!isObject(value)) return null;

  const clientName =
    typeof value.clientName === "string" ? value.clientName : undefined;

  const totalHT =
    typeof value.totalHT === "number" || typeof value.totalHT === "string"
      ? value.totalHT
      : undefined;

  const totalTTC =
    typeof value.totalTTC === "number" || typeof value.totalTTC === "string"
      ? value.totalTTC
      : undefined;

  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items: DevisAnalysisItem[] = rawItems
    .filter(isObject)
    .map((item) => ({
      description:
        typeof item.description === "string" ? item.description : undefined,
      price:
        typeof item.price === "number" || typeof item.price === "string"
          ? item.price
          : undefined,
    }));

  return {
    clientName,
    totalHT,
    totalTTC,
    items,
  };
}

function parseAmountToCents(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }

  return 0;
}

export default function Devis() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [analysisResult, setAnalysisResult] =
    useState<DevisAnalysisResult | null>(null);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const { accessToken } = useAuth();

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

  const startPolling = (jobId: string) => {
    clearPoll();

    if (isPollingRef.current) return;
    isPollingRef.current = true;

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

        const data = (await response.json()) as {
          status?: string;
          result?: unknown;
          error?: string;
        };

        if (data.status === "completed") {
          clearPoll();

          let finalData: unknown = data.result;

          if (typeof finalData === "string") {
            try {
              const match = finalData.match(/\{[\s\S]*\}/);
              finalData = match ? JSON.parse(match[0]) : JSON.parse(finalData);
            } catch {
              finalData = null;
            }
          }

          const normalized = normalizeDevisAnalysisResult(finalData);
          setAnalysisResult(normalized);
          setIsProcessing(false);
        } else if (data.status === "failed") {
          clearPoll();
          setIsProcessing(false);
          toast.error(data.error || "L'analyse a échoué.");
        }
      } catch (e) {
        const err = e as ApiRequestError;

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

    void tick();
    pollIntervalRef.current = setInterval(tick, delayMs);
  };

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

  const sendToAI = async (file: File | Blob, typeOverride?: string) => {
    setIsProcessing(true);
    setAnalysisResult(null);
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

      const data = (await response.json()) as AiRunResponse;

      if (data.jobId) {
        startPolling(String(data.jobId));
      } else {
        toast.error("Le backend n’a pas renvoyé de jobId.");
        setIsProcessing(false);
        clearPoll();
      }
    } catch (e) {
      const err = e as ApiRequestError;
      toast.error(err.message || "Erreur de connexion.");
      setIsProcessing(false);
      clearPoll();
    }
  };

  const handleCreateQuote = async () => {
    if (!analysisResult || isSavingQuote) return;

    setIsSavingQuote(true);

    try {
      await fetchWithAuth("/quotes", {
        method: "POST",
        body: JSON.stringify({
          client_name: analysisResult.clientName ?? "Client",
          title: "Devis généré par IA",
          total_amount_cents: parseAmountToCents(analysisResult.totalTTC),
        }),
      });

      toast.success("Devis enregistré avec succès.");
    } catch (e) {
      const err = e as ApiRequestError;
      toast.error(err.message || "Impossible d’enregistrer le devis.");
    } finally {
      setIsSavingQuote(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-3 p-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && sendToAI(e.target.files[0])}
        className="hidden"
        accept="image/*,audio/*"
      />

      <div className="shrink-0 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-emerald-500">📂</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
            Analyse de documents
          </span>
        </div>

        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-6 transition-all ${
            isProcessing
              ? "border-blue-200 bg-[var(--theme-bg)]"
              : "border-[var(--theme-border)] hover:border-[var(--theme-border)] hover:bg-[var(--theme-bg)]"
          }`}
        >
          {isProcessing ? (
            <span className="flex items-center gap-2 text-[11px] font-medium text-blue-500">
              <Loader2 size={16} className="animate-spin" /> Analyse en cours...
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[11px] font-medium italic text-[var(--theme-muted)]">
              <CloudUpload size={16} /> Photo ou fichier audio
            </span>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[2rem] bg-[var(--theme-card)] p-6 shadow-sm">
        {analysisResult ? (
          <div className="animate-in slide-in-from-bottom-4 space-y-6 duration-500">
            <h2 className="border-b pb-2 text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
              Analyse Terminée
            </h2>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-500">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-[var(--theme-muted)]">
                    Client
                  </p>
                  <p className="font-bold text-[var(--theme-text)]">
                    {analysisResult.clientName || "Non identifié"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[var(--theme-bg)] p-3">
                  <p className="text-[10px] font-bold uppercase text-[var(--theme-muted)]">
                    Total HT
                  </p>
                  <p className="text-lg font-black text-[var(--theme-text)]">
                    {analysisResult.totalHT || "0"} €
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-emerald-500">
                    Total TTC
                  </p>
                  <p className="text-lg font-black text-emerald-600">
                    {analysisResult.totalTTC || "0"} €
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-[var(--theme-muted)]">
                  Prestations
                </p>
                {analysisResult.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2 text-[11px]"
                  >
                    <span className="font-medium text-[var(--theme-muted)]">
                      {item.description || "Prestation"}
                    </span>
                    <span className="font-bold text-[var(--theme-text)]">
                      {item.price ?? "0"}€
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <button
                onClick={handleCreateQuote}
                disabled={isSavingQuote}
                className="w-full rounded-xl bg-[var(--theme-primary)] py-3 text-[11px] font-bold uppercase text-white disabled:opacity-60"
              >
                {isSavingQuote ? "Enregistrement..." : "Créer le devis"}
              </button>

              <button
                onClick={() => setAnalysisResult(null)}
                className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] py-3 text-[11px] font-bold uppercase text-[var(--theme-text)]"
              >
                Nouveau Devis
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-between py-4">
            <h2 className="text-lg font-black uppercase text-[var(--theme-text)]">
              Note Vocale
            </h2>

            <div className="flex flex-col items-center gap-6">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`flex h-32 w-32 items-center justify-center rounded-full border-8 border-[var(--theme-border)] shadow-2xl transition-all active:scale-95 ${
                  isRecording
                    ? "animate-pulse border-red-100 bg-red-500 text-white"
                    : isProcessing
                      ? "bg-[var(--theme-bg)] text-[var(--theme-muted)]"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
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
                <p className="text-[13px] font-black uppercase text-[var(--theme-text)]">
                  {isRecording
                    ? "Enregistrement..."
                    : isProcessing
                      ? "Analyse en cours..."
                      : "Appuyez pour parler"}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase italic text-[var(--theme-muted)]">
                  Dictez les travaux, l'IA s'occupe du reste
                </p>
              </div>
            </div>

            <div className="flex w-full justify-around border-t border-[var(--theme-border)] pt-4 opacity-30">
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