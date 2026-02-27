import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "../../store/auth.store";

interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

function safeParseJson(text: string): unknown {
  if (typeof text !== "string") return text;
  const cleaned = text.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return cleaned;
  }
}

function normalizeBaseUrl(input: string): string {
  const trimmed = String(input || "").trim().replace(/\/$/, "");
  if (trimmed.endsWith("/ai")) return trimmed.slice(0, -3);
  return trimmed;
}

const API_BASE = normalizeBaseUrl(
  (import.meta as any).env?.VITE_API_URL || "http://localhost:8080"
);
const AI_URL = `${API_BASE}/ai`;

// ✅ on vise bien sous 4000 chars côté backend
const PROMPT_MAX = 2500;

function truncateString(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 30) + "\n...[TRUNCATED]";
}

/**
 * ✅ Contexte ULTRA compact
 * - On exclut data.sheets entièrement
 * - On tronque summary.resume
 * - On limite les tableaux
 */
function buildUltraCompactContext(report: any) {
  if (!report || typeof report !== "object") return null;

  const summaryResume =
    typeof report?.summary?.resume === "string"
      ? truncateString(report.summary.resume, 500)
      : undefined;

  const compact = {
    meta: report?.meta
      ? {
          currency: report.meta.currency,
          sourceFileName: report.meta.sourceFileName ?? null,
          generatedAt: report.meta.generatedAt,
          sheets: Array.isArray(report.meta.sheets) ? report.meta.sheets.slice(0, 20) : [],
          rowsTotal: report.meta.rowsTotal,
        }
      : undefined,

    totals: report?.totals
      ? {
          recettesHT: report.totals.recettesHT,
          recettesTTC: report.totals.recettesTTC,
          depensesHT: report.totals.depensesHT,
          depensesTTC: report.totals.depensesTTC,
          resultatNet: report.totals.resultatNet,
        }
      : undefined,

    tva: report?.tva
      ? {
          collectee: report.tva.collectee,
          deductible: report.tva.deductible,
          aPayer: report.tva.aPayer,
          parTaux: Array.isArray(report.tva.parTaux) ? report.tva.parTaux.slice(0, 6) : [],
        }
      : undefined,

    breakdown: report?.breakdown
      ? {
          parMois: Array.isArray(report.breakdown.parMois)
            ? report.breakdown.parMois.slice(0, 6)
            : [],
          topRecettes: Array.isArray(report.breakdown.topRecettes)
            ? report.breakdown.topRecettes.slice(0, 5)
            : [],
          topDepenses: Array.isArray(report.breakdown.topDepenses)
            ? report.breakdown.topDepenses.slice(0, 5)
            : [],
        }
      : undefined,

    anomalies: Array.isArray(report?.anomalies) ? report.anomalies.slice(0, 10) : [],

    summary: report?.summary
      ? {
          resume: summaryResume,
          actions: Array.isArray(report.summary.actions) ? report.summary.actions.slice(0, 10) : [],
          questions: Array.isArray(report.summary.questions)
            ? report.summary.questions.slice(0, 10)
            : [],
        }
      : undefined,
  };

  return compact;
}

export default function ExpertChatPanel() {
  const { accessToken } = useAuth();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Mode Expert IA prêt. Lance une analyse (Compta/Devis/Vision) puis clique sur “Mode Expert IA”.",
      timestamp: new Date(),
    },
  ]);

  const [analysisContext, setAnalysisContext] = useState<any | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const getWelcomeMessage = useCallback(() => {
    return "Contexte chargé. Pose ta question (TVA, charges, marge, trésorerie, anomalies…).";
  }, []);

  useEffect(() => {
    const handleExpertEvent = (event: Event) => {
      const custom = event as CustomEvent;
      const { analysisData, message } = (custom.detail ?? {}) as {
        analysisData?: any;
        message?: string;
      };

      if (analysisData) setAnalysisContext(analysisData);

      setMessages((prev) => [
        ...prev,
        {
          id: `expert-${Date.now()}`,
          role: "assistant",
          content: message || getWelcomeMessage(),
          timestamp: new Date(),
        },
      ]);
    };

    window.addEventListener("openExpertChat", handleExpertEvent);
    return () => window.removeEventListener("openExpertChat", handleExpertEvent);
  }, [getWelcomeMessage]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const startPolling = (jobId: string) => {
    let stopped = false;
    let timer: number | null = null;

    const schedule = (ms: number) => {
      if (stopped) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(tick, ms);
    };

    const tick = async () => {
      if (stopped) return;

      try {
        const res = await fetch(`${AI_URL}/status/${jobId}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });

        if (res.status === 304) {
          schedule(1500);
          return;
        }

        const data: any = await res.json();

        if (data.status === "completed") {
          stopped = true;
          setIsLoading(false);

          const parsed = safeParseJson(data.result);
          const content =
            typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);

          setMessages((prev) => [
            ...prev,
            { id: `ai-${Date.now()}`, role: "assistant", content, timestamp: new Date() },
          ]);
          return;
        }

        if (data.status === "failed") {
          stopped = true;
          setIsLoading(false);

          setMessages((prev) => [
            ...prev,
            {
              id: `fail-${Date.now()}`,
              role: "assistant",
              content: data.error || "Analyse IA échouée.",
              timestamp: new Date(),
            },
          ]);
          return;
        }

        schedule(1500);
      } catch {
        stopped = true;
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `poll-err-${Date.now()}`,
            role: "assistant",
            content: "Erreur de suivi du job. Vérifie Redis/BullMQ.",
            timestamp: new Date(),
          },
        ]);
      }
    };

    schedule(0);
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q || isLoading) return;

    if (!accessToken) {
      setMessages((prev) => [
        ...prev,
        {
          id: `auth-${Date.now()}`,
          role: "assistant",
          content: "Tu n’es pas authentifié. Connecte-toi puis réessaie.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: q, timestamp: new Date() },
    ]);
    setInput("");
    setIsLoading(true);

    try {
      let finalPrompt = q;

      if (analysisContext) {
        const compact = buildUltraCompactContext(analysisContext);
        const ctxStr = compact ? JSON.stringify(compact) : "";
        finalPrompt = `CONTEXTE_COMPTA_JSON:${ctxStr}\n\nQUESTION:${q}`;
      }

      finalPrompt = truncateString(finalPrompt, PROMPT_MAX);

      const form = new FormData();
      form.append("type", "assistant");
      // ✅ compat: certains schémas utilisent prompt, d'autres message
      form.append("prompt", finalPrompt);
      form.append("message", finalPrompt);

      const res = await fetch(`${AI_URL}/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      // lire la réponse même si ce n'est pas JSON
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        setIsLoading(false);
        const msg = json?.error || json?.message || text || "Body invalide";
        setMessages((prev) => [
          ...prev,
          {
            id: `http-${Date.now()}`,
            role: "assistant",
            content: `Erreur backend (${res.status}). ${msg}`,
            timestamp: new Date(),
          },
        ]);
        return;
      }

      const jobId = json?.jobId ?? json?.id;
      if (!jobId) {
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `noj-${Date.now()}`,
            role: "assistant",
            content: "Le backend n’a pas renvoyé de jobId.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      startPolling(String(jobId));
    } catch {
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Erreur technique. Vérifie la connexion backend.\nURL utilisée: ${AI_URL}`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Mode Expert IA prêt. Lance une analyse puis clique sur “Mode Expert IA”.",
        timestamp: new Date(),
      },
    ]);
    setAnalysisContext(null);
  };

  const contextChip = useMemo(() => {
    if (!analysisContext) return null;
    const currency = analysisContext?.meta?.currency ?? "EUR";
    const net = analysisContext?.totals?.resultatNet;
    return (
      <div className="px-3 py-2 text-[11px] font-bold bg-white border border-slate-100 rounded-2xl">
        Contexte chargé • Devise: {currency}
        {typeof net === "number" ? ` • Résultat net: ${net} ${currency}` : ""}
      </div>
    );
  }, [analysisContext]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 flex items-center justify-between gap-2">
        {contextChip}
        <button
          onClick={clearChat}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-600"
          title="Réinitialiser"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
                <Bot size={16} />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-gradient-to-tr from-purple-600 to-blue-600 text-white"
                  : "bg-white border border-slate-100 text-slate-800"
              }`}
            >
              {m.content}
            </div>

            {m.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                <User size={16} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="animate-spin" size={16} />
            IA en cours…
          </div>
        )}
      </div>

      <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? handleSend() : null)}
          placeholder="Pose ta question…"
          className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center disabled:opacity-50"
          title="Envoyer"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}