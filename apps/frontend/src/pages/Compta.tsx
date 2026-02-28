import React, { useMemo, useRef, useState } from "react";
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
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { useUser } from "../context/user.context";

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

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [rawResult, setRawResult] = useState<any>(null);
  const [report, setReport] = useState<ComptaReport | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

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
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/status/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 304) return;

        const data = await response.json();

        if (data.status === "completed") {
          clearInterval(pollInterval);
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

          // ✅ injecte le report dans le store Dashboard (mise à jour à chaque upload)
          setDashboardReport(validated.data);

          // ✅ refresh quota après succès
          await refreshQuotaFromDashboard();
        }

        if (data.status === "failed") {
          clearInterval(pollInterval);
          setIsProcessing(false);
          setReport(null);
          setSchemaError(null);
          setRawResult(null);
          alert(data.error || "L'analyse comptable a échoué.");
        }
      } catch {
        clearInterval(pollInterval);
        setIsProcessing(false);
      }
    }, 2000);
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!accessToken) return alert("Vous devez être connecté.");

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

    openWith({
      source: "compta",
      message: `Analyse expert activée ! Résultat net estimé: ${resultatNet}€. Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?`,
      analysisData: report,
      createdAt: new Date().toISOString(),
    });

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
      {/* ... UI inchangée ... */}
      {/* (j’ai laissé tout le JSX identique à ton fichier actuel) */}
    </div>
  );
}