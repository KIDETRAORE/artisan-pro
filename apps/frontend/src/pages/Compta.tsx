// apps/frontend/src/pages/Compta.tsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileBarChart,
  CloudUpload,
  Loader2,
  TrendingUp,
  TrendingDown,
  ReceiptEuro,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Table2,
  Download,
  ListChecks,
  Receipt,
  Wallet,
  Building2,
} from "lucide-react";
import { useAuth } from "../store/auth.store";
import { useComptaReportStore } from "../store/comptaReport.store";
import { useExpertAssistantStore } from "../features/ai/expertAssistant.store";
import { z } from "zod";
import { ApiRequestError } from "../utils/apiRequestError";
import { toast } from "react-hot-toast";
import type { AiRunResponse } from "../api/types";

/**
 * Helpers formats
 */
const IsoDateTime = z.string().refine(
  (v: string) => !Number.isNaN(Date.parse(v)),
  "generatedAt must be a valid ISO datetime string"
);

const YearMonth = z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM");

/**
 * Severity aligned with your report needs
 */
const AnomalySeverity = z.enum(["info", "warn", "critical"]);

export const ComptaReportSchema = z.object({
  meta: z.object({
    currency: z.string().default("EUR"),
    sourceFileName: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v == null ? undefined : v)),
    generatedAt: IsoDateTime,
    sheets: z.array(z.string()),
    rowsTotal: z.number(),
  }),

  totals: z.object({
    recettesHT: z.number(),
    recettesTTC: z.number(),
    depensesHT: z.number(),
    depensesTTC: z.number(),
    resultatNet: z.number(),
  }),

  tva: z.object({
    collectee: z.number(),
    deductible: z.number(),
    aPayer: z.number(),
    parTaux: z
      .array(
        z.object({
          taux: z.number(),
          baseHT: z.number(),
          tva: z.number(),
          type: z.enum(["vente", "achat"]),
        })
      )
      .default([]),
  }),

  breakdown: z.object({
    parMois: z
      .array(
        z.object({
          month: YearMonth,
          recettesHT: z.number(),
          depensesHT: z.number(),
          resultatNet: z.number(),
          tvaCollectee: z.number(),
          tvaDeductible: z.number(),
        })
      )
      .default([]),

    topRecettes: z
      .array(
        z.object({
          label: z.string(),
          amountHT: z.number(),
          count: z.number(),
        })
      )
      .default([]),

    topDepenses: z
      .array(
        z.object({
          label: z.string(),
          amountHT: z.number(),
          count: z.number(),
        })
      )
      .default([]),
  }),

  anomalies: z
    .array(
      z.object({
        severity: AnomalySeverity,
        message: z.string(),
        sheet: z
          .string()
          .optional()
          .nullable()
          .transform((v) => (v == null ? undefined : v)),
        rowIndex: z
          .number()
          .optional()
          .nullable()
          .transform((v) => (v == null ? undefined : v)),
      })
    )
    .default([]),

  data: z.object({
    sheets: z.record(
      z.string(),
      z.object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.unknown())),
        truncated: z.boolean().optional(),
      })
    ),
  }),

  summary: z.object({
    resume: z.string(),
    actions: z.array(z.string()).default([]),
    questions: z.array(z.string()).default([]),
  }),
});

export type ComptaReport = z.infer<typeof ComptaReportSchema>;

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/ai`
  : "http://localhost:8080/ai";

const CANONICAL_COMPTA_ACTIONS = [
  {
    title: "Factures clients",
    description: "Base canonique des ventes et suivi clients.",
    to: "/sales-invoices",
    icon: Receipt,
  },
  {
    title: "Factures fournisseurs",
    description: "Base canonique des achats et échéances fournisseurs.",
    to: "/purchase-bills",
    icon: Building2,
  },
  {
    title: "Paiements",
    description: "Encaissements, décaissements et trésorerie court terme.",
    to: "/payments",
    icon: Wallet,
  },
];

function formatMoney(value: number | undefined): string {
  return `${Number(value ?? 0).toFixed(2)} €`;
}

export default function Compta() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const setDashboardReport = useComptaReportStore((s) => s.setReport);
  const openWith = useExpertAssistantStore((s) => s.openWith);

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [rawResult, setRawResult] = useState<any>(null);
  const [report, setReport] = useState<ComptaReport | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);
  const didHydrateRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, []);

  const safeParseResult = (value: any) => {
    if (!value) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/```json|```/gi, "").trim();
      try {
        return JSON.parse(cleaned);
      } catch {
        return cleaned;
      }
    }
    return value;
  };

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    isPollingRef.current = false;
  };

  const startPolling = (id: string) => {
    clearPoll();

    if (isPollingRef.current) return;
    isPollingRef.current = true;

    let delayMs = 3000;
    const maxDelayMs = 10000;

    const tick = async () => {
      try {
        const response = await fetch(`${API_URL}/status/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 304) return;

        if (response.status === 429) {
          clearPoll();
          delayMs = Math.min(maxDelayMs, delayMs * 2);
          isPollingRef.current = true;
          pollRef.current = setInterval(tick, delayMs);
          return;
        }

        const data = await response.json();

        if (data.status === "completed") {
          clearPoll();
          setIsProcessing(false);

          const parsed = safeParseResult(data.result);
          setRawResult(parsed);

          const validated = ComptaReportSchema.safeParse(parsed);
          if (!validated.success) {
            setReport(null);
            setSchemaError(
              "Le serveur a renvoyé un JSON invalide (format ComptaReport)."
            );
            return;
          }

          setSchemaError(null);
          setReport(validated.data);
          setDashboardReport(validated.data);
        }

        if (data.status === "failed") {
          clearPoll();
          setIsProcessing(false);
          setReport(null);
          setSchemaError(null);
          setRawResult(null);
          toast.error(data.error || "L'analyse comptable a échoué.");
        }
      } catch (e) {
        clearPoll();
        setIsProcessing(false);

        const err = e as ApiRequestError;
        if (err?.code === "quota_exceeded") {
          toast.error("Quota atteint. Passez en PRO pour continuer.");
          navigate("/upgrade");
        } else {
          toast.error(err?.message || "Erreur pendant l'analyse.");
        }
      }
    };

    void tick();
    pollRef.current = setInterval(tick, delayMs);
  };

  useEffect(() => {
    if (!accessToken) return;
    if (didHydrateRef.current) return;
    if (isProcessing) return;
    if (report) return;

    didHydrateRef.current = true;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/compta/latest`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const json = (await res.json()) as any;

        if (!res.ok || !json?.report) {
          return;
        }

        const parsed = safeParseResult(json.report);
        setRawResult(parsed);

        const validated = ComptaReportSchema.safeParse(parsed);
        if (!validated.success) {
          setSchemaError(
            "Le serveur a renvoyé un JSON invalide (format ComptaReport)."
          );
          return;
        }

        setSchemaError(null);
        setReport(validated.data);
        setDashboardReport(validated.data);

        if (json?.id) {
          setAnalysisId(String(json.id));
        }
      } catch {
        // silencieux : on ne bloque pas la page si le réseau échoue
      }
    })();
  }, [accessToken, isProcessing, report, setDashboardReport]);

  const handleUpload = async () => {
    if (!file) return;

    if (!accessToken) {
      toast.error("Vous devez être connecté.");
      return;
    }

    clearPoll();

    setIsProcessing(true);
    setReport(null);
    setRawResult(null);
    setSchemaError(null);
    setAnalysisId(null);

    const form = new FormData();
    form.append("type", "compta");
    form.append("file", file);

    try {
      const response = await fetch(`${API_URL}/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      const data = (await response.json()) as AiRunResponse;

      if (!data.jobId) {
        setIsProcessing(false);
        toast.error((data as any)?.error || "Erreur lors du lancement.");
        return;
      }

      setAnalysisId(
        (data as any)?.analysisId ? String((data as any).analysisId) : null
      );

      setJobId(String(data.jobId));
      startPolling(String(data.jobId));
    } catch (e) {
      setIsProcessing(false);

      const err = e as ApiRequestError;
      if (err?.code === "quota_exceeded") {
        toast.error("Quota atteint. Passez en PRO pour continuer.");
        navigate("/upgrade");
      } else {
        toast.error(err?.message || "Erreur lors du lancement.");
      }
    }
  };

  const handleExpertChat = async () => {
    if (!accessToken) {
      toast.error("Vous devez être connecté.");
      return;
    }

    const resultatNet = Number(report?.totals?.resultatNet ?? 0) || 0;

    let finalAnalysisId = analysisId;

    try {
      const res = await fetch(`${API_URL}/compta/latest`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const json = (await res.json()) as any;

      if (!res.ok || !json?.id) {
        toast.error("Impossible de retrouver l’analyse compta à utiliser.");
        return;
      }

      finalAnalysisId = String(json.id);
      setAnalysisId(finalAnalysisId);
    } catch {
      toast.error("Erreur réseau lors de la récupération de l’analyse compta.");
      return;
    }

    openWith({
      source: "compta",
      message: `Analyse expert activée ! Résultat net estimé: ${resultatNet}€. Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?`,
      analysisData: report,
      createdAt: new Date().toISOString(),
    });

    const event = new CustomEvent("openExpertChat", {
      detail: {
        analysisId: finalAnalysisId,
        message: `Analyse expert activée ! Résultat net estimé: ${resultatNet}€. Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?`,
      },
    });
    window.dispatchEvent(event);
  };

  const downloadJson = () => {
    if (!jobId) return;
    window.open(`${API_URL}/export/${jobId}?format=json`, "_blank");
  };

  const downloadCsv = () => {
    if (!jobId) return;
    window.open(`${API_URL}/export/${jobId}?format=csv`, "_blank");
  };

  const totals = report?.totals;
  const tva = report?.tva;

  const profitColor =
    totals && totals.resultatNet >= 0 ? "text-emerald-600" : "text-red-600";

  const anomaliesCount = report?.anomalies?.length ?? 0;

  const previewSheets = useMemo(() => {
    if (!report?.data?.sheets) return [];
    return Object.entries(report.data.sheets).map(([name, table]) => ({
      name,
      columns: table.columns,
      rows: table.rows,
      truncated: !!table.truncated,
    }));
  }, [report]);

  const attentionPoints = useMemo(() => {
    if (!report) return [];

    return report.anomalies.map((anomaly) => {
      const location =
        anomaly.sheet || anomaly.rowIndex != null
          ? ` (${[
              anomaly.sheet ? `feuille ${anomaly.sheet}` : null,
              anomaly.rowIndex != null ? `ligne ${anomaly.rowIndex}` : null,
            ]
              .filter(Boolean)
              .join(", ")})`
          : "";

      return `${anomaly.message}${location}`;
    });
  }, [report]);

  const recommendedActions = useMemo(() => {
    if (!report) return [];

    const actions = [...report.summary.actions];

    if ((report.tva.aPayer ?? 0) > 0) {
      actions.push("Anticiper le règlement de la TVA à payer.");
    }

    if ((report.totals.resultatNet ?? 0) < 0) {
      actions.push(
        "Identifier rapidement les charges à réduire pour restaurer la marge."
      );
    }

    return Array.from(new Set(actions));
  }, [report]);

  const keyQuestions = useMemo(() => {
    if (!report) return [];
    return report.summary.questions;
  }, [report]);

  return (
    <div className="p-6 pb-32">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg">
          <FileBarChart size={22} />
        </div>
        <div>
          <h2 className="leading-tight text-2xl font-black text-[var(--theme-text)]">
            Compta IA
          </h2>
          <p className="text-sm font-semibold text-[var(--theme-muted)]">
            Analyse XLSX/CSV → Rapport structuré + preview + exports
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {CANONICAL_COMPTA_ACTIONS.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.title}
              to={action.to}
              className="group rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--theme-bg)] text-[var(--theme-primary)]">
                <Icon size={22} />
              </div>

              <div className="text-sm font-black text-[var(--theme-text)]">
                {action.title}
              </div>
              <p className="mt-2 min-h-[40px] text-xs leading-relaxed text-[var(--theme-muted)]">
                {action.description}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="mb-6 space-y-3 rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-[var(--theme-text)]">
          Pilotage IA comptable
        </h3>

        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)]">
          Surveillez les écarts entre recettes, dépenses et résultat net pour
          anticiper les tensions de trésorerie.
        </div>

        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--theme-muted)]">
          <li>Identifier les charges qui progressent trop vite</li>
          <li>Vérifier les périodes où la marge nette baisse</li>
          <li>Prioriser les actions qui améliorent le cash à court terme</li>
        </ul>
      </div>

      <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 rounded-2xl bg-[var(--theme-primary)] px-4 py-3 text-xs font-black uppercase tracking-widest text-white"
            >
              <CloudUpload size={16} />
              Choisir un fichier
            </button>

            {file && (
              <span className="text-sm font-bold text-[var(--theme-text)]">
                {file.name}
              </span>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || isProcessing}
              className="rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {isProcessing ? "Analyse…" : "Lancer analyse"}
            </button>
          </div>

          {schemaError && (
            <div className="mt-3 text-sm font-semibold text-red-600">
              {schemaError}
            </div>
          )}
        </div>
      </div>

      {report && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                <ReceiptEuro size={14} />
                Recettes
              </div>
              <div className="mt-3 text-2xl font-black text-[var(--theme-text)]">
                {formatMoney(totals?.recettesTTC)}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                <TrendingDown size={14} />
                Dépenses
              </div>
              <div className="mt-3 text-2xl font-black text-[var(--theme-text)]">
                {formatMoney(totals?.depensesTTC)}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                <TrendingUp size={14} />
                Résultat net
              </div>
              <div className={`mt-3 text-2xl font-black ${profitColor}`}>
                {formatMoney(totals?.resultatNet)}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
                Insight IA
              </h3>
              <span className="text-xs font-bold text-[var(--theme-muted)]">
                {report.meta.currency}
              </span>
            </div>

            <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--theme-text)]">
              {report.summary.resume}
            </p>
          </div>

          <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
                TVA
              </h3>
              <span className="text-xs font-bold text-[var(--theme-muted)]">
                {report.meta.currency}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
                <div className="text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                  Collectée
                </div>
                <div className="mt-2 text-xl font-black text-[var(--theme-text)]">
                  {formatMoney(tva?.collectee)}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
                <div className="text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                  Déductible
                </div>
                <div className="mt-2 text-xl font-black text-[var(--theme-text)]">
                  {formatMoney(tva?.deductible)}
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--theme-primary)] p-4 text-white">
                <div className="text-xs font-black uppercase tracking-widest text-white/70">
                  À payer
                </div>
                <div className="mt-2 text-xl font-black">
                  {formatMoney(tva?.aPayer)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
                Points d’attention
              </h3>
            </div>

            {attentionPoints.length > 0 ? (
              <div className="space-y-2">
                {attentionPoints.map((point) => (
                  <div
                    key={point}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
                  >
                    {point}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--theme-muted)]">
                Aucune anomalie détectée sur cette analyse.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ListChecks size={16} className="text-[var(--theme-text)]" />
                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
                  Recommandations
                </h3>
              </div>

              {recommendedActions.length > 0 ? (
                <div className="space-y-2">
                  {recommendedActions.map((action) => (
                    <div
                      key={action}
                      className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)]"
                    >
                      {action}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--theme-muted)]">
                  Aucune recommandation supplémentaire.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
                  Actions / Questions
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                    Questions à trancher
                  </div>
                  {keyQuestions.length > 0 ? (
                    <div className="space-y-2">
                      {keyQuestions.map((question) => (
                        <div
                          key={question}
                          className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)]"
                        >
                          {question}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--theme-muted)]">
                      Aucune question ouverte.
                    </div>
                  )}
                </div>

                <button
                  onClick={handleExpertChat}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-tr from-purple-600 to-blue-600 py-4 text-xs font-black uppercase tracking-widest text-white"
                >
                  <Sparkles size={16} />
                  Mode Expert IA
                </button>
                <p className="text-xs font-semibold text-[var(--theme-muted)]">
                  Ouvre la bulle trans-onglet et injecte l’analyse dans le chat
                  expert.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--theme-text)]">
                <Table2 size={14} />
                Preview
              </h3>

              <div className="flex gap-2">
                <button
                  onClick={downloadJson}
                  className="flex items-center gap-2 rounded-2xl bg-[var(--theme-bg)] px-3 py-2 text-xs font-black uppercase tracking-widest text-[var(--theme-text)]"
                >
                  <Download size={14} /> JSON
                </button>
                <button
                  onClick={downloadCsv}
                  className="flex items-center gap-2 rounded-2xl bg-[var(--theme-bg)] px-3 py-2 text-xs font-black uppercase tracking-widest text-[var(--theme-text)]"
                >
                  <Download size={14} /> CSV
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {previewSheets.map((s) => (
                <div
                  key={s.name}
                  className="overflow-hidden rounded-2xl border border-[var(--theme-border)]"
                >
                  <div className="flex items-center justify-between bg-[var(--theme-bg)] px-4 py-3">
                    <div className="text-xs font-black uppercase tracking-widest text-[var(--theme-text)]">
                      {s.name}
                    </div>
                    {s.truncated && (
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-700">
                        <AlertTriangle size={14} />
                        Preview tronquée
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[var(--theme-card)]">
                        <tr>
                          {s.columns.map((c, idx) => (
                            <th
                              key={idx}
                              className="px-4 py-2 text-left text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-[var(--theme-card)]">
                        {s.rows.slice(0, 10).map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className="border-t border-[var(--theme-border)]"
                          >
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className="px-4 py-2 text-[var(--theme-text)]"
                              >
                                {String(cell ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-[var(--theme-bg)] px-4 py-3 text-xs font-semibold text-[var(--theme-muted)]">
                    Affichage: 10 lignes (preview). Export disponible via
                    boutons.
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--theme-text)]">
                  Synthèse technique
                </h3>
              </div>
              <div className="text-xs font-bold text-[var(--theme-muted)]">
                Anomalies: {anomaliesCount}
              </div>
            </div>

            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--theme-muted)]">
              {JSON.stringify(rawResult, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {!report && isProcessing && (
        <div className="mt-6 flex items-center gap-3 rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 font-bold text-[var(--theme-text)] shadow-sm">
          <Loader2 className="animate-spin" size={18} />
          Analyse en cours…
        </div>
      )}
    </div>
  );
}