// apps/frontend/src/components/devis/DevisAiActions.tsx
import React, { useEffect, useRef, useState } from "react";
import { Mic, FileUp, Loader2, StopCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchWithAuth } from "../../auth/fetchWithAuth";
import { ApiRequestError } from "../../utils/apiRequestError";

interface DevisAiActionsProps {
  onAnalysisComplete: (data: any) => void;
}

export const DevisAiActions = ({ onAnalysisComplete }: DevisAiActionsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  // --- 1. FONCTION COMMUNE POUR APPELER L'API ---
  const sendToAI = async (formData: FormData) => {
    // ✅ Stoppe un poll en cours si l’utilisateur relance
    clearPoll();

    setIsProcessing(true);
    const loadingToast = toast.loading("L'IA analyse votre demande...");

    try {
      const { jobId } = await fetchWithAuth<{ jobId: string }>("/ai/run", {
        method: "POST",
        body: formData,
      });

      pollJobStatus(jobId, loadingToast);
    } catch (e) {
      const err = e as ApiRequestError;

      if (err.code === "quota_exceeded") {
        toast.error("Quota atteint. Passez en PRO pour continuer.", {
          id: loadingToast,
        });
      } else {
        toast.error(err.message || "Erreur de connexion au serveur", {
          id: loadingToast,
        });
      }

      setIsProcessing(false);
      clearPoll();
    }
  };

  // --- 2. LOGIQUE UPLOAD FICHIER ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "vision");

    sendToAI(formData);

    // reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- 3. LOGIQUE VOCALE ---
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");
        formData.append("type", "vocal");

        sendToAI(formData);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Micro introuvable ou refusé");
    }
  };

  // --- 4. POLLING (BULLMQ) ---
  const pollJobStatus = (jobId: string, toastId: string) => {
    // ✅ Empêche plusieurs polls simultanés
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    // ✅ Backoff 429 : 1s → 2s → 4s → 8s → 10s (max)
    let delayMs = 1000;
    const maxDelayMs = 10000;

    const tick = async () => {
      try {
        const data = await fetchWithAuth<any>(`/ai/status/${jobId}`);

        if (data.status === "completed") {
          clearPoll();
          setIsProcessing(false);

          const result =
            typeof data.result === "string" ? JSON.parse(data.result) : data.result;

          onAnalysisComplete(result);
          toast.success("Analyse terminée avec succès !", { id: toastId });
          return;
        }

        if (data.status === "failed") {
          clearPoll();
          setIsProcessing(false);
          toast.error("L'IA n'a pas pu traiter la demande", { id: toastId });
          return;
        }

        // status pending/running → continuer
      } catch (e) {
        const err = e as ApiRequestError;

        // ✅ 429 backoff + reprise du polling
        if ((err as any).status === 429 || err.code === "too_many_requests") {
          clearPoll();
          delayMs = Math.min(maxDelayMs, delayMs * 2);
          toast.error("Trop de requêtes, nouvelle tentative...", { id: toastId });

          isPollingRef.current = true;
          pollIntervalRef.current = setInterval(tick, delayMs);
          return;
        }

        // ✅ Clear interval dans tous les chemins d’erreur
        clearPoll();
        setIsProcessing(false);

        if (err.code === "quota_exceeded") {
          toast.error("Quota atteint. Passez en PRO pour continuer.", {
            id: toastId,
          });
        } else {
          toast.error(err.message || "Perte de connexion", { id: toastId });
        }
      }
    };

    // Démarrage immédiat, puis interval
    tick();
    pollIntervalRef.current = setInterval(tick, delayMs);
  };

  return (
    <div className="flex items-center gap-3 bg-[var(--theme-card)] p-2 rounded-xl border border-[var(--theme-border)]">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileUpload}
        accept="image/*,application/pdf"
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isProcessing || isRecording}
        className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors disabled:opacity-50"
      >
        {isProcessing ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <FileUp className="w-6 h-6" />
        )}
      </button>

      <div className="w-[1px] h-6 bg-slate-200" />

      <button
        type="button"
        onClick={toggleRecording}
        disabled={isProcessing}
        className={`p-2 rounded-lg transition-colors ${
          isRecording
            ? "bg-red-500 text-white animate-pulse"
            : "hover:bg-red-50 text-red-500"
        }`}
      >
        {isRecording ? (
          <StopCircle className="w-6 h-6" />
        ) : (
          <Mic className="w-6 h-6" />
        )}
      </button>
    </div>
  );
};
