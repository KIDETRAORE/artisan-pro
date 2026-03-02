import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { useAuth } from "../store/auth.store";
import { useComptaReportStore } from "../store/comptaReport.store";
import { useExpertAssistantStore } from "../features/ai/expertAssistant.store";
import { z } from "zod";

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

export default function Compta() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const setDashboardReport = useComptaReportStore((s) => s.setReport);
  const openWith = useExpertAssistantStore((s) => s.openWith);

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [rawResult, setRawResult] = useState<any>(null);
  const [report, setReport] = useState<ComptaReport | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // ✅ MODIF: anti multi-poll + cleanup unmount
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
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

  const startPolling = (id: string) => {
    // ✅ MODIF: éviter plusieurs polls simultanés
    if (pollRef.current) return;

    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/status/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 304) return;

        const data = await response.json();

        if (data.status === "completed") {
          // ✅ MODIF: clearInterval via ref (safe)
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }

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

          // ✅ injecte le report dans le store Dashboard (inchangé)
          setDashboardReport(validated.data);
        }

        if (data.status === "failed") {
          // ✅ MODIF: clearInterval via ref (safe)
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }

          setIsProcessing(false);
          setReport(null);
          setSchemaError(null);
          setRawResult(null);
          alert(data.error || "L'analyse comptable a échoué.");
        }
      } catch {
        // ✅ MODIF: clearInterval + setIsProcessing(false) dans le catch
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setIsProcessing(false);
      }
    }, 2000);
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!accessToken) return alert("Vous devez être connecté.");

    // ✅ MODIF: stop ancien poll si existant
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    setIsProcessing(true);
    setReport(null);
    setRawResult(null);
    setSchemaError(null);

    const form = new FormData();
    form.append("type", "compta");
    form.append("file", file);

    const response = await fetch(`${API_URL}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    const data = await response.json();
    if (!data.jobId) {
      setIsProcessing(false);
      return alert(data.error || "Erreur lors du lancement.");
    }

    setJobId(String(data.jobId));
    startPolling(String(data.jobId));
  };

  const handleExpertChat = () => {
    if (!report) return;

    const resultatNet = Number(report?.totals?.resultatNet ?? 0) || 0;

    // ✅ MODIF: envoie le report au store expert + navigation dashboard (bulle)
    openWith({
      source: "compta",
      message: `Analyse expert activée ! Résultat net estimé: ${resultatNet}€. Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?`,
      analysisData: report,
      createdAt: new Date().toISOString(),
    });

    // ✅ fallback existant si ton Layout écoute toujours l’event (migration progressive)
    const event = new CustomEvent("openExpertChat", {
      detail: {
        analysisData: report,
        message: `Analyse expert activée ! Résultat net estimé: ${resultatNet}€. Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?`,
      },
    });
    window.dispatchEvent(event);

    navigate("/dashboard");
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

  return (
    <div className="p-6 pb-32">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg">
          <FileBarChart size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 leading-tight">
            Compta IA
          </h2>
          <p className="text-sm text-slate-500 font-semibold">
            Analyse XLSX/CSV → Rapport structuré + preview + exports
          </p>
        </div>
      </div>

      {/* Upload Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => inputRef.current?.click()}
              className="px-4 py-3 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest flex items-center gap-2"
            >
              <CloudUpload size={16} />
              Choisir un fichier
            </button>

            {file && (
              <span className="text-sm font-bold text-slate-700">
                {file.name}
              </span>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || isProcessing}
              className="px-4 py-3 rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
            >
              {isProcessing ? "Analyse…" : "Lancer analyse"}
            </button>
          </div>

          {schemaError && (
            <div className="mt-3 text-sm text-red-600 font-semibold">
              {schemaError}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {report && (
        <div className="mt-6 space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-slate-500 font-black text-xs uppercase tracking-widest">
                <ReceiptEuro size={14} />
                Recettes
              </div>
              <div className="mt-3 text-2xl font-black text-slate-900">
                {totals?.recettesTTC?.toFixed(2)} €
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-slate-500 font-black text-xs uppercase tracking-widest">
                <TrendingDown size={14} />
                Dépenses
              </div>
              <div className="mt-3 text-2xl font-black text-slate-900">
                {totals?.depensesTTC?.toFixed(2)} €
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-slate-500 font-black text-xs uppercase tracking-widest">
                <TrendingUp size={14} />
                Résultat net
              </div>
              <div className={`mt-3 text-2xl font-black ${profitColor}`}>
                {totals?.resultatNet?.toFixed(2)} €
              </div>
            </div>
          </div>

          {/* TVA */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
                TVA
              </h3>
              <span className="text-xs font-bold text-slate-500">
                {report.meta.currency}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Collectée
                </div>
                <div className="mt-2 text-xl font-black text-slate-900">
                  {tva?.collectee?.toFixed(2)} €
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Déductible
                </div>
                <div className="mt-2 text-xl font-black text-slate-900">
                  {tva?.deductible?.toFixed(2)} €
                </div>
              </div>

              <div className="bg-slate-900 rounded-2xl p-4 text-white">
                <div className="text-xs font-black uppercase tracking-widest text-white/70">
                  À payer
                </div>
                <div className="mt-2 text-xl font-black">
                  {tva?.aPayer?.toFixed(2)} €
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                <Table2 size={14} />
                Preview
              </h3>

              <div className="flex gap-2">
                <button
                  onClick={downloadJson}
                  className="px-3 py-2 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-widest flex items-center gap-2"
                >
                  <Download size={14} /> JSON
                </button>
                <button
                  onClick={downloadCsv}
                  className="px-3 py-2 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-widest flex items-center gap-2"
                >
                  <Download size={14} /> CSV
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {previewSheets.map((s) => (
                <div
                  key={s.name}
                  className="border border-slate-100 rounded-2xl overflow-hidden"
                >
                  <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
                    <div className="font-black text-xs uppercase tracking-widest text-slate-700">
                      {s.name}
                    </div>
                    {s.truncated && (
                      <div className="text-xs font-bold text-amber-700 flex items-center gap-2">
                        <AlertTriangle size={14} />
                        Preview tronquée
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white">
                        <tr>
                          {s.columns.map((c, idx) => (
                            <th
                              key={idx}
                              className="text-left px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {s.rows.slice(0, 10).map((row, rIdx) => (
                          <tr key={rIdx} className="border-t border-slate-100">
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className="px-4 py-2 text-slate-700"
                              >
                                {String(cell ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-4 py-3 bg-slate-50 text-xs text-slate-600 font-semibold">
                    Affichage: 10 lignes (preview). Export disponible via boutons.
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary + Expert */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
                  Résumé
                </h3>
              </div>
              <div className="text-xs font-bold text-slate-500">
                Anomalies: {anomaliesCount}
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
              {report.summary.resume}
            </p>

            <div className="mt-4">
              <button
                onClick={handleExpertChat}
                className="w-full py-4 rounded-2xl bg-gradient-to-tr from-purple-600 to-blue-600 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />
                Mode Expert IA
              </button>
              <p className="mt-2 text-xs text-slate-500 font-semibold">
                Ouvre la bulle trans-onglet et injecte l’analyse dans le chat
                expert.
              </p>
            </div>
          </div>
        </div>
      )}

      {!report && isProcessing && (
        <div className="mt-6 bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex items-center gap-3 text-slate-700 font-bold">
          <Loader2 className="animate-spin" size={18} />
          Analyse en cours…
        </div>
      )}
    </div>
  );
}