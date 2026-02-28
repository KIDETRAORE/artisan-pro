import React, { useState, useRef } from "react";
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
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { useUser } from "../context/user.context";

const API_URL = "http://localhost:8080/ai";

export default function Devis() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const { accessToken } = useAuth();
  const { userData, setUserData } = useUser();

  const refreshQuotaFromDashboard = async () => {
    try {
      const data = await fetchWithAuth<any>("/dashboard", { method: "GET" });

      const plan = data?.subscription?.plan ?? userData?.plan ?? "FREE";
      const status = String(data?.subscription?.status ?? "inactive").toLowerCase();
      const proActive = plan === "PRO" && (status === "active" || status === "trialing");

      setUserData({
        ...userData,
        plan,
        quota: proActive
          ? undefined
          : {
              used: Number(data?.quota?.used ?? 0),
              limit: Number(data?.quota?.limit ?? 0),
            },
      });
    } catch {
      // best effort
    }
  };

  // --- 1. POLLING DU STATUT ---
  const startPolling = (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const data = await response.json();

        if (data.status === "completed") {
          clearInterval(pollInterval);
          let finalData = data.result;

          if (typeof finalData === "string") {
            const match = finalData.match(/\{[\s\S]*\}/);
            finalData = match ? JSON.parse(match[0]) : JSON.parse(finalData);
          }

          setAnalysisResult(finalData);
          setIsProcessing(false);

          // ✅ refresh quota après succès
          await refreshQuotaFromDashboard();
        } else if (data.status === "failed") {
          clearInterval(pollInterval);
          setIsProcessing(false);
          alert("L'analyse a échoué.");
        }
      } catch (err) {
        console.error("Erreur polling:", err);
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
        const audioBlob = new Blob(audioChunks.current, { type: "audio/mp3" });
        await sendToAI(audioBlob, "vocal");
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch {
      alert("Accès micro refusé ou non disponible.");
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

    try {
      const formData = new FormData();
      formData.append(
        "file",
        file,
        typeOverride === "vocal" ? "capture.mp3" : "image.jpg"
      );

      const finalType = typeOverride || (file.type.startsWith("audio") ? "vocal" : "vision");
      formData.append("type", finalType);

      const response = await fetch(`${API_URL}/run`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error("Serveur injoignable");

      const data = await response.json();
      if (data.jobId) startPolling(data.jobId);
    } catch (err: any) {
      console.error("💥 Erreur:", err);
      alert("Erreur de connexion.");
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

      {/* ... UI inchangée ... */}
    </div>
  );
}