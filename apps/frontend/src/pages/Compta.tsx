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

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/ai`
  : "http://localhost:8080/ai";

const PREVIEW_ROWS = 200;

function safeParseResult(dataResult: any) {
  if (dataResult == null) return null;
  if (typeof dataResult === "object") return dataResult;

  if (typeof dataResult === "string") {
    const cleaned = dataResult.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const candidate = match ? match[0] : cleaned;

    try {
      return JSON.parse(candidate);
    } catch {
      return { summary: cleaned };
    }
  }

  return { summary: String(dataResult) };
}

function formatEUR(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0 €";
  return `${Math.round(n * 100) / 100} €`;
}

function safeString(v: unknown) {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function downloadBlob(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsvLine(values: any[], sep = ";") {
  return values
    .map((v) => {
      const s = safeString(v);
      const escaped = s.replace(/"/g, '""');
      return `"${escaped}"`;
    })
    .join(sep);
}

export default function Compta() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [expandedSheets, setExpandedSheets] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { accessToken } = useAuth();

  const handleExpertChat = () => {
    if (!report) return;

    navigate("/assistant");

    const resultatNet =
      Number(report?.totals?.resultatNet ?? report?.resultat_net ?? 0) || 0;

    setTimeout(() => {
      const event = new CustomEvent("openExpertChat", {
        detail: {
          analysisData: report,
          message: `Analyse expert activée ! Résultat net estimé: ${resultatNet}€. Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?`,
        },
      });
      window.dispatchEvent(event);
    }, 150);
  };

  const startPolling = (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 304) return;

        const data = await response.json();

        if (data.status === "completed") {
          clearInterval(pollInterval);
          const result = safeParseResult(data.result);
          setReport(result);
          setIsProcessing(false);
          return;
        }

        if (data.status === "failed") {
          clearInterval(pollInterval);
          setIsProcessing(false);
          alert(data.error || "L'analyse comptable a échoué.");
          return;
        }
      } catch (err) {
        console.error("Erreur polling:", err);
      }
    }, 1200);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setReport(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "compta");

    try {
      const response = await fetch(`${API_URL}/run`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await response.json();
      if (data.jobId) startPolling(data.jobId);
      else throw new Error(data.message || "jobId manquant");
    } catch {
      alert("Erreur de connexion au serveur.");
      setIsProcessing(false);
    }
  };

  const totals = report?.totals ?? null;
  const tva = report?.tva ?? null;
  const breakdown = report?.breakdown ?? null;
  const anomalies = report?.anomalies ?? [];
  const dataSheets = report?.data?.sheets ?? null;

  const legacy = useMemo(() => {
    if (!report) return null;
    const isLegacy =
      report.total_recettes !== undefined ||
      report.total_depenses !== undefined ||
      report.resultat_net !== undefined;

    if (!isLegacy) return null;

    return {
      recettes: Number(report.total_recettes ?? 0),
      depenses: Number(report.total_depenses ?? 0),
      resultat: Number(report.resultat_net ?? 0),
      tvaCollectee: Number(report.tva_collectee ?? 0),
      tvaDeductible: Number(report.tva_deductible ?? 0),
      summary: safeString(report.summary ?? ""),
    };
  }, [report]);

  const resultatNet = Number(totals?.resultatNet ?? legacy?.resultat ?? 0) || 0;
  const recettesHT = Number(totals?.recettesHT ?? legacy?.recettes ?? 0) || 0;
  const depensesHT = Number(totals?.depensesHT ?? legacy?.depenses ?? 0) || 0;

  const tvaSolde =
    Number(tva?.aPayer ?? (legacy ? legacy.tvaCollectee - legacy.tvaDeductible : 0)) || 0;

  const summaryText =
    safeString(report?.summary?.resume ?? legacy?.summary ?? report?.summary ?? "");

  const exportJson = () => {
    if (!report) return;
    const name = safeString(report?.meta?.sourceFileName || "compta");
    downloadBlob(`${name}.analysis.json`, JSON.stringify(report, null, 2), "application/json");
  };

  const exportCsv = () => {
    if (!dataSheets) {
      alert("Aucune donnée tabulaire à exporter (data.sheets manquant).");
      return;
    }

    // CSV multi-onglets dans un seul fichier texte
    const parts: string[] = [];
    for (const [sheetName, table] of Object.entries<any>(dataSheets)) {
      const columns: string[] = table.columns ?? [];
      const rows: any[][] = table.rows ?? [];
      parts.push(`### SHEET: ${sheetName}`);
      parts.push(toCsvLine(columns));
      for (const row of rows) {
        parts.push(toCsvLine(row));
      }
      parts.push(""); // blank line
    }

    const name = safeString(report?.meta?.sourceFileName || "compta");
    downloadBlob(`${name}.preview.csv`, parts.join("\n"), "text/csv;charset=utf-8");
  };

  return (
    <div className="h-full w-full max-w-md mx-auto overflow-y-auto px-4 pt-4 pb-24 scroll-smooth animate-in fade-in duration-500">
      {/* UPLOAD */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-emerald-500 font-bold">📊</span>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Base de connaissance externe
          </span>
        </div>

        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-100 rounded-2xl py-6 flex flex-col items-center justify-center gap-2 text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
            accept=".csv,.xlsx"
          />

          {isProcessing ? (
            <Loader2 className="animate-spin text-blue-500" size={20} />
          ) : (
            <CloudUpload size={20} className="opacity-40" />
          )}

          <span className="text-xs font-bold italic text-center px-4 text-slate-500">
            {isProcessing ? "Calculs IA en cours..." : "Importer un fichier compta (CSV / XLSX)"}
          </span>
        </div>
      </div>

      {/* REPORT */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm flex flex-col min-h-[400px]">
        {!report ? (
          <div className="flex-1 flex flex-col items-center text-center justify-center py-10">
            <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mb-8 border border-slate-100">
              <FileBarChart size={40} />
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase mb-3">
              Comptabilité IA
            </h2>
            <p className="text-slate-400 text-[13px] leading-relaxed italic max-w-[280px]">
              Importez un CSV/XLSX pour générer un bilan + TVA automatiquement.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* header */}
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                Analyse Terminée
              </h2>
              <CheckCircle2 className="text-emerald-500" size={18} />
            </div>

            {/* exports */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={exportJson}
                className="w-full py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
              >
                <Download size={14} /> Export JSON
              </button>
              <button
                onClick={exportCsv}
                className="w-full py-3 bg-slate-100 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>

            {/* meta */}
            {report?.meta && (
              <div className="text-[11px] text-slate-500 border border-slate-100 rounded-2xl p-4 bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Fichier</span>
                  <span className="italic">{safeString(report.meta.sourceFileName ?? "")}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-bold">Onglets</span>
                  <span className="italic">{(report.meta.sheets ?? []).join(", ")}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-bold">Lignes</span>
                  <span className="italic">{Number(report.meta.rowsTotal ?? 0)}</span>
                </div>
              </div>
            )}

            {/* résultat net */}
            <div className="bg-slate-900 rounded-3xl p-6 text-center text-white shadow-xl">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">
                Résultat Net
              </p>
              <p className="text-3xl font-black text-emerald-400">{formatEUR(resultatNet)}</p>
            </div>

            {/* recettes / dépenses */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-600 mb-1">
                  <TrendingUp size={14} />
                  <span className="text-[9px] font-black uppercase">Recettes (HT)</span>
                </div>
                <p className="text-lg font-bold text-slate-900">{formatEUR(recettesHT)}</p>
              </div>

              <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                <div className="flex items-center gap-2 text-red-600 mb-1">
                  <TrendingDown size={14} />
                  <span className="text-[9px] font-black uppercase">Dépenses (HT)</span>
                </div>
                <p className="text-lg font-bold text-slate-900">{formatEUR(depensesHT)}</p>
              </div>
            </div>

            {/* TVA */}
            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  <ReceiptEuro size={18} />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">TVA à payer</p>
                  <p className="font-bold text-blue-900">{formatEUR(tvaSolde)}</p>
                </div>
              </div>
            </div>

            {/* breakdown par mois */}
            {!!breakdown?.parMois?.length && (
              <div className="border border-slate-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 text-slate-700">
                  <Table2 size={16} />
                  <h3 className="text-[10px] font-black uppercase tracking-widest">Par mois</h3>
                </div>

                <div className="space-y-2">
                  {breakdown.parMois.map((m: any) => (
                    <div
                      key={m.month}
                      className="flex items-center justify-between text-[12px] bg-slate-50 border border-slate-100 rounded-xl px-3 py-2"
                    >
                      <span className="font-bold text-slate-700">{m.month}</span>
                      <span className="text-slate-600">
                        {formatEUR(m.resultatNet)} (R:{formatEUR(m.recettesHT)} / D:{formatEUR(m.depensesHT)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* anomalies */}
            {!!anomalies?.length && (
              <div className="border border-amber-100 bg-amber-50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2 text-amber-800">
                  <AlertTriangle size={16} />
                  <h3 className="text-[10px] font-black uppercase tracking-widest">Anomalies</h3>
                </div>
                <ul className="text-[12px] text-amber-900 space-y-1">
                  {anomalies.slice(0, 10).map((a: any, idx: number) => (
                    <li key={idx}>
                      • <span className="font-bold">{a.severity}</span> — {a.message}
                      {a.sheet ? ` (${a.sheet}` : ""}
                      {a.rowIndex ? `, ligne ${a.rowIndex}` : ""}
                      {a.sheet ? `)` : ""}
                    </li>
                  ))}
                </ul>
                {anomalies.length > 10 && (
                  <div className="text-[11px] text-amber-800 mt-2 italic">
                    +{anomalies.length - 10} autres anomalies…
                  </div>
                )}
              </div>
            )}

            {/* summary */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">
              "{summaryText || "Analyse effectuée."}"
            </div>

            {/* tables (preview) */}
            {dataSheets && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                  Données du fichier (preview)
                </h3>

                {Object.entries<any>(dataSheets).map(([sheetName, table]) => {
                  const columns: string[] = table.columns ?? [];
                  const rows: any[][] = table.rows ?? [];

                  const expanded = !!expandedSheets[sheetName];
                  const displayRows = expanded ? rows : rows.slice(0, PREVIEW_ROWS);

                  return (
                    <div key={sheetName} className="border border-slate-100 rounded-2xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-black text-slate-900 text-[12px]">
                          {sheetName}{" "}
                          <span className="text-slate-400 text-[10px] font-bold">
                            ({rows.length} lignes{table.truncated ? ", tronqué" : ""})
                          </span>
                        </div>

                        {rows.length > PREVIEW_ROWS && (
                          <button
                            onClick={() =>
                              setExpandedSheets((prev) => ({
                                ...prev,
                                [sheetName]: !prev[sheetName],
                              }))
                            }
                            className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800"
                          >
                            {expanded ? "Réduire" : "Voir tout"}
                          </button>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-[11px]">
                          <thead>
                            <tr className="text-slate-500">
                              {columns.map((c, idx) => (
                                <th key={idx} className="text-left font-black py-2 pr-3">
                                  {c || `col_${idx + 1}`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {displayRows.map((r, ridx) => (
                              <tr key={ridx} className="border-t border-slate-100">
                                {columns.map((_, cidx) => (
                                  <td key={cidx} className="py-2 pr-3 text-slate-700 align-top">
                                    {safeString(r?.[cidx])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {!expanded && rows.length > PREVIEW_ROWS && (
                        <div className="mt-2 text-[10px] text-slate-400 italic">
                          Preview: {PREVIEW_ROWS} premières lignes.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* expert */}
            <button
              onClick={handleExpertChat}
              className="w-full py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 active:scale-95"
            >
              <Sparkles size={14} /> Mode Expert AI
            </button>

            <button
              onClick={() => setReport(null)}
              className="w-full py-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest hover:text-slate-600 transition-all"
            >
              Nouvelle Analyse
            </button>
          </div>
        )}
      </div>
    </div>
  );
}