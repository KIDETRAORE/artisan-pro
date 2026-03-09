// apps/frontend/src/pages/Vision.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  Camera,
  ShieldCheck,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ScanSearch,
} from "lucide-react";
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export default function Vision() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { user } = useAuth();
  const { userData, setUserData } = useUser();

  const quotaRefreshInFlightRef = useRef(false);
  const lastQuotaRefreshAtRef = useRef(0);

  const refreshQuotaFromDashboard = async () => {
    const now = Date.now();
    if (quotaRefreshInFlightRef.current) return;
    if (now - lastQuotaRefreshAtRef.current < 3000) return;

    quotaRefreshInFlightRef.current = true;
    lastQuotaRefreshAtRef.current = now;

    try {
      const data = await fetchWithAuth<any>("/dashboard", { method: "GET" });

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

  const analysisSummary = useMemo(() => {
    if (!analysis) return "Aucune analyse disponible.";

    if (typeof analysis === "string") return analysis;

    if (!isObject(analysis)) {
      return "L’analyse est disponible mais son format n’a pas pu être résumé.";
    }

    const summary =
      typeof analysis.summary === "string"
        ? analysis.summary
        : typeof analysis.resume === "string"
          ? analysis.resume
          : typeof analysis.recommendation === "string"
            ? analysis.recommendation
            : typeof analysis.description === "string"
              ? analysis.description
              : null;

    if (summary) return summary;

    const detectedKeys = Object.keys(analysis);
    if (detectedKeys.length === 0) {
      return "L’analyse n’a renvoyé aucun élément exploitable.";
    }

    return `Analyse disponible avec ${detectedKeys.length} élément${
      detectedKeys.length > 1 ? "s" : ""
    } détecté${detectedKeys.length > 1 ? "s" : ""}.`;
  }, [analysis]);

  const attentionPoints = useMemo(() => {
    if (!analysis || !isObject(analysis)) return [];

    return [
      ...toStringArray(analysis.risks),
      ...toStringArray(analysis.issues),
      ...toStringArray(analysis.warnings),
      ...toStringArray(analysis.alerts),
    ];
  }, [analysis]);

  const recommendations = useMemo(() => {
    if (!analysis || !isObject(analysis)) return [];

    return [
      ...toStringArray(analysis.recommendations),
      ...toStringArray(analysis.actions),
      ...toStringArray(analysis.nextSteps),
    ];
  }, [analysis]);

  const keyFacts = useMemo(() => {
    if (!analysis || !isObject(analysis)) return [];

    const excluded = new Set([
      "summary",
      "resume",
      "recommendation",
      "description",
      "risks",
      "issues",
      "warnings",
      "alerts",
      "recommendations",
      "actions",
      "nextSteps",
    ]);

    return Object.entries(analysis)
      .filter(([key, value]) => !excluded.has(key) && value != null)
      .slice(0, 6)
      .map(([key, value]) => ({
        label: key,
        value:
          typeof value === "string"
            ? value
            : typeof value === "number" || typeof value === "boolean"
              ? String(value)
              : Array.isArray(value)
                ? `${value.length} élément${value.length > 1 ? "s" : ""}`
                : "Voir détail technique",
      }));
  }, [analysis]);

  const actionItems = useMemo(() => {
    const items: string[] = [];

    if (recommendations.length > 0) {
      items.push(...recommendations);
    }

    if (attentionPoints.length > 0) {
      items.push("Contrôler les points d’attention avant décision chantier.");
    }

    if (analysis) {
      items.push("Envoyer l’analyse au mode Expert pour obtenir un plan d’action détaillé.");
    }

    return Array.from(new Set(items));
  }, [analysis, attentionPoints, recommendations]);

  return (
    <div className="h-full max-w-5xl mx-auto flex flex-col gap-4 overflow-hidden animate-in fade-in duration-500">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhoto}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      <div className="bg-[var(--theme-card)] rounded-2xl p-4 border border-[var(--theme-border)] shadow-sm shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-emerald-500 text-xs">📄</span>
          <span className="text-[9px] font-black text-[var(--theme-muted)] uppercase tracking-widest">
            Base de connaissance externe
          </span>
        </div>

        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className="border-2 border-dashed border-[var(--theme-border)] rounded-xl py-4 flex flex-col items-center justify-center gap-1 text-[var(--theme-muted)] hover:bg-[var(--theme-bg)] transition-colors cursor-pointer group"
        >
          <span className="text-[11px] font-medium italic opacity-60 flex items-center gap-2">
            ☁️ Importer un catalogue (Excel/CSV)
          </span>
        </div>
      </div>

      <div className="flex-1 bg-[var(--theme-card)] rounded-[2rem] p-6 shadow-sm flex flex-col min-h-0 overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-black text-[var(--theme-text)] tracking-tight uppercase">
            Suivi de Chantier
          </h2>
          <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-100 uppercase">
            <ShieldCheck size={10} /> IA Vision Expert
          </span>
        </div>

        {!analysis ? (
          <>
            <p className="text-[var(--theme-muted)] text-[12px] leading-snug italic mb-6">
              Prenez une photo. L'IA analyse l'avancement technique et les
              matériaux sans identifier les personnes.
            </p>

            <div
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className="flex-1 border-2 border-dashed border-[var(--theme-border)] rounded-[1.5rem] flex flex-col items-center justify-center group cursor-pointer hover:bg-[var(--theme-bg)] transition-all mb-2 min-h-[200px]"
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
                  <div className="w-14 h-14 bg-[var(--theme-card)] rounded-full shadow-md flex items-center justify-center text-[#4f46e5] mb-3 border border-[var(--theme-border)] group-hover:scale-105 transition-transform">
                    <Camera size={24} />
                  </div>
                  <span className="font-black text-[var(--theme-text)] text-[13px] uppercase tracking-wide">
                    Prendre une photo
                  </span>
                  <span className="text-[9px] text-[var(--theme-muted)] font-bold uppercase tracking-widest mt-0.5">
                    Analyse instantanée
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SummaryCard
                icon={<ScanSearch size={16} />}
                title="Analyse"
                value="Inspection disponible"
              />
              <SummaryCard
                icon={<AlertTriangle size={16} />}
                title="Points d’attention"
                value={String(attentionPoints.length)}
              />
              <SummaryCard
                icon={<CheckCircle2 size={16} />}
                title="Actions"
                value={String(actionItems.length)}
              />
            </div>

            <SectionCard
              title="Insight IA"
              icon={<Sparkles size={16} />}
              description="Résumé rapide de l’inspection."
            >
              <p className="text-sm text-[var(--theme-text)]">{analysisSummary}</p>
            </SectionCard>

            <SectionCard
              title="Points d’attention"
              icon={<AlertTriangle size={16} />}
              description="Risques ou éléments à vérifier sur le chantier."
            >
              {attentionPoints.length > 0 ? (
                <div className="space-y-2">
                  {attentionPoints.map((point) => (
                    <div
                      key={point}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
                    >
                      {point}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--theme-muted)]">
                  Aucun point critique explicite détecté dans le résultat.
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Recommandations"
              icon={<ClipboardList size={16} />}
              description="Préconisations issues de l’analyse."
            >
              {recommendations.length > 0 ? (
                <div className="space-y-2">
                  {recommendations.map((item) => (
                    <div
                      key={item}
                      className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)]"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--theme-muted)]">
                  Aucune recommandation structurée n’a été renvoyée.
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Actions"
              icon={<CheckCircle2 size={16} />}
              description="Suite logique après inspection."
            >
              <div className="space-y-2">
                {actionItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </SectionCard>

            {keyFacts.length > 0 ? (
              <SectionCard
                title="Résumé technique"
                icon={<ScanSearch size={16} />}
                description="Quelques éléments détectés dans la réponse."
              >
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {keyFacts.map((fact) => (
                    <div
                      key={fact.label}
                      className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2"
                    >
                      <div className="text-[10px] font-bold uppercase text-[var(--theme-muted)]">
                        {fact.label}
                      </div>
                      <div className="mt-1 text-sm font-medium text-[var(--theme-text)]">
                        {fact.value}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              title="Détail technique"
              icon={<Sparkles size={16} />}
              description="Réponse brute conservée pour contrôle."
            >
              <pre className="text-[11px] whitespace-pre-wrap text-[var(--theme-text)]">
                {JSON.stringify(analysis, null, 2)}
              </pre>
            </SectionCard>

            <button
              onClick={() => sendToExpertMode(analysis)}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Sparkles size={14} />
              Envoyer au mode Expert
            </button>

            <button
              onClick={() => setAnalysis(null)}
              className="w-full py-3 bg-[var(--theme-primary)] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest"
            >
              Nouvelle Inspection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
      <div className="flex items-center gap-2 text-[var(--theme-muted)]">
        {icon}
        <p className="text-[10px] font-bold uppercase">{title}</p>
      </div>
      <p className="mt-2 text-lg font-black text-[var(--theme-text)]">{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-[var(--theme-text)]">{icon}</div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
            {title}
          </h3>
          <p className="text-[10px] font-medium text-[var(--theme-muted)]">
            {description}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}