import React, { useRef, useState } from 'react';
import { Mic, FileUp, Loader2, StopCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../../config/api'; // On importe l'URL brute

interface DevisAiActionsProps {
  onAnalysisComplete: (data: any) => void;
}

export const DevisAiActions = ({ onAnalysisComplete }: DevisAiActionsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- 1. FONCTION COMMUNE POUR APPELER L'API ---
  const sendToAI = async (formData: FormData) => {
    setIsProcessing(true);
    const loadingToast = toast.loading("L'IA analyse votre demande...");

    try {
      // Récupération du token depuis le localStorage (ajuste selon ton système d'auth)
      const token = localStorage.getItem('token'); 

      const response = await fetch(`${API_URL}/ai/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) throw new Error('Erreur serveur');

      const { jobId } = await response.json();
      pollJobStatus(jobId, loadingToast);

    } catch (error) {
      toast.error("Erreur de connexion au serveur", { id: loadingToast });
      setIsProcessing(false);
    }
  };

  // --- 2. LOGIQUE UPLOAD FICHIER ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'vision');
    sendToAI(formData);
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
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('type', 'vocal');
        sendToAI(formData);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast.error("Micro introuvable ou refusé");
    }
  };

  // --- 4. POLLING (BULLMQ) ---
  const pollJobStatus = async (jobId: string, toastId: string) => {
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/ai/status/${jobId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(interval);
          setIsProcessing(false);
          
          // Parsing sécurisé du résultat
          const result = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
          
          onAnalysisComplete(result);
          toast.success("Analyse terminée avec succès !", { id: toastId });
        } 
        else if (data.status === 'failed') {
          clearInterval(interval);
          setIsProcessing(false);
          toast.error("L'IA n'a pas pu traiter la demande", { id: toastId });
        }
      } catch (err) {
        clearInterval(interval);
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
      >
        {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileUp className="w-6 h-6" />}
      </button>

      <div className="w-[1px] h-6 bg-slate-200" />

      <button 
        type="button"
        onClick={toggleRecording}
        disabled={isProcessing}
        className={`p-2 rounded-lg transition-colors ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-red-50 text-red-500'}`}
      >
        {isRecording ? <StopCircle className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </button>
    </div>
  );
};