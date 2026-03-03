import React, { useState, useRef } from "react";
import { Camera, ShieldCheck, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "../store/auth.store";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import {
  useUser,
  normalizePlan,
  normalizeStatus,
  isProActive,
} from "../context/user.context";
import { ApiRequestError } from "../utils/apiRequestError";
import { toast } from "react-hot-toast";

export default function Vision() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { user } = useAuth();
  const { userData, setUserData } = useUser();

  // ✅ MODIF 1: lock + throttle pour éviter les refresh quota en boucle
  const quotaRefreshInFlightRef = useRef(false);
  const lastQuotaRefreshAtRef = useRef(0);

  const refreshQuotaFromDashboard = async () => {
    // ✅ throttle: 1 refresh max / 3 secondes
    const now = Date.now();
    if (quotaRefreshInFlightRef.current) return;
    if (now - lastQuotaRefreshAtRef.current < 3000) return;

    quotaRefreshInFlightRef.current = true;
    lastQuotaRefreshAtRef.current = now;

    try {
      const data = await fetchWithAuth<any>("/dashboard", { method: "GET" });

      // ✅ MODIF 2: setUserData doit recevoir un UserData direct (pas une fonction)
      const rawPlan = data?.subscription?.plan ?? userData?.plan ?? "free";
      const rawStatus =
        data?.subscription?.status ?? userData?.status ?? "inactive";

      const plan = normalizePlan(rawPlan);
      const status = normalizeStatus(rawStatus);
      const proActive = isProActive(plan, status);

      setUserData({
        ...(userData ?? {}),
        email: userData?.email ?? user?.email ?? undefined,
        plan,
        status,
        quota: proActive
          ? undefined
          : {
              used: Number(data?.quota?.used ?? 0),
              limit: Number(data?.quota?.limit ?? 0),
            },
      } as any);
    } catch {
      // best effort
    } finally {
      quotaRefreshInFlightRef.current = false;
    }
  };

  const sendToExpertMode = (payload: any) => {
    navigate("/assistant");

    window.dispatchEvent(
      new CustomEvent("openExpertChat", {
        detail: {
          analysisData: payload,
          message:
            "Voici une analyse Vision. Donne-moi une interprétation détaillée, les risques, et un plan d’action concret (matériel, étapes, sécurité).",
        },
      })
    );
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setAnalysis(null);

    const form = new FormData();
    form.append("image", file);

    try {
      const res = await fetchWithAuth<any>("/vision/analyze", {
        method: "POST",
        body: form,
      });

      const data = res;

      setAnalysis(data);

      await refreshQuotaFromDashboard();
    } catch (e) {
      const err = e as ApiRequestError;

      if (err.code === "quota_exceeded") {
        toast.error("Quota atteint. Passez en PRO pour continuer.");
        navigate("/upgrade");
      } else {
        toast.error(err.message || "Erreur lors de l'analyse.");
      }
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="h-full max-w-md mx-auto flex flex-col gap-3 overflow-hidden animate-in fade-in duration-500">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhoto}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-emerald-500 text-xs">📄</span>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            Base de connaissance externe
          </span>
        </div>

        {/* ✅ Import catalogue (inchangé) */}
        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-50 rounded-xl py-4 flex flex-col items-center justify-center gap-1 text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer group"
        >
          <span className="text-[11px] font-medium italic opacity-60 flex items-center gap-2">
            ☁️ Importer un catalogue (Excel/CSV)
          </span>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[2rem] p-6 shadow-sm flex flex-col min-h-0 overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">
            Suivi de Chantier
          </h2>
          <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-100 uppercase">
            <ShieldCheck size={10} /> IA Vision Expert
          </span>
        </div>

        {!analysis ? (
          <>
            <p className="text-slate-400 text-[12px] leading-snug italic mb-6">
              Prenez une photo. L'IA analyse l'avancement technique et les
              matériaux sans identifier les personnes.
            </p>

            {/* ✅ MODIF UNIQUE: "Prendre une photo" déclenche l'appareil photo (input capture) */}
            <div
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className="flex-1 border-2 border-dashed border-slate-100 rounded-[1.5rem] flex flex-col items-center justify-center group cursor-pointer hover:bg-slate-50 transition-all mb-2 min-h-[200px]"
            >
              {isProcessing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-12 h-12 text-[#4f46e5] animate-spin" />
                  <span className="text-[11px] font-bold text-blue-500 uppercase animate-pulse">
                    Analyse technique...
                  </span>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 bg-white rounded-full shadow-md flex items-center justify-center text-[#4f46e5] mb-3 border border-slate-50 group-hover:scale-105 transition-transform">
                    <Camera size={24} />
                  </div>
                  <span className="font-black text-slate-900 text-[13px] uppercase tracking-wide">
                    Prendre une photo
                  </span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    Analyse instantanée
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
            <pre className="text-[11px] whitespace-pre-wrap">
              {JSON.stringify(analysis, null, 2)}
            </pre>

            <button
              onClick={() => sendToExpertMode(analysis)}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Sparkles size={14} />
              Envoyer au mode Expert
            </button>

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