import React, { useRef, useState } from "react";
import { Mic, FileUp, Loader2, StopCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchWithAuth } from "../../auth/fetchWithAuth";

interface DevisAiActionsProps {
  onAnalysisComplete: (data: any) => void;
}

export const DevisAiActions = ({ onAnalysisComplete }: DevisAiActionsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  /**
   * Helper: fetchWithAuth est typé unknown dans ton projet -> cast en Response ici.
   */
  const fetchAuth = async (
    input: string,
    init?: RequestInit
  ): Promise<Response> => {
    return (await fetchWithAuth(input, init)) as unknown as Response;
  };

  // --- 1. FONCTION COMMUNE POUR APPELER L'API ---
  const sendToAI = async (formData: FormData) => {
    setIsProcessing(true);
    const loadingToast = toast.loading("L'IA analyse votre demande...");

    try {
      // ⚠️ FormData => ne pas définir Content-Type
      const response = await fetchAuth("/ai/run", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Erreur serveur");

      const payload = (await response.json()) as { jobId?: string };
      const jobId = payload.jobId;

      if (!jobId) {
        throw new Error("Missing jobId");
      }

      pollJobStatus(jobId, loadingToast);
    } catch (_error) {
      toast.error("Erreur de connexion au serveur", { id: loadingToast });
      setIsProcessing(false);
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

    // reset input (permet de re-uploader le même fichier)
    e.target.value = "";
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

        // stop mic
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (_err) {
      toast.error("Micro introuvable ou refusé");
    }
  };

  // --- 4. POLLING (BULLMQ) ---
  const pollJobStatus = async (jobId: string, toastId: string) => {
    const interval = window.setInterval(async () => {
      try {
        const response = await fetchAuth(`/ai/status/${jobId}`, {
          method: "GET",
        });

        if (!response.ok) {
          throw new Error("Bad status");
        }

        const data = (await response.json()) as {
          status?: string;
          result?: any;
          error?: any;
        };

        if (data.status === "completed") {
          window.clearInterval(interval);
          setIsProcessing(false);

          // Parsing best-effort
          let result = data.result;
          try {
            result = typeof result === "string" ? JSON.parse(result) : result;
          } catch {
            // non-json
          }

          onAnalysisComplete(result);
          toast.success("Analyse terminée avec succès !", { id: toastId });
        } else if (data.status === "failed") {
          window.clearInterval(interval);
          setIsProcessing(false);
          toast.error("L'IA n'a pas pu traiter la demande", { id: toastId });
        }
      } catch (_err) {
        window.clearInterval(interval);
        setIsProcessing(false);
        toast.error("Perte de connexion", { id: toastId });
      }
    }, 2000);
  };

  return (
    <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200">
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
        title="Importer un fichier"
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
        title={isRecording ? "Stop" : "Enregistrer"}
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