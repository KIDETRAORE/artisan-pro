import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "../../store/auth.store";
import { ApiRequestError, toApiRequestError } from "../../utils/apiRequestError";
import type { AiRunResponse } from "../../api/types";

function normalizeBaseUrl(input: string): string {
  const trimmed = String(input || "").trim().replace(/\/$/, "");
  if (trimmed.endsWith("/ai")) return trimmed.slice(0, -3);
  return trimmed;
}

const API_BASE = normalizeBaseUrl(
  (import.meta as any).env?.VITE_API_URL || "http://localhost:8080"
);
const AI_URL = `${API_BASE}/ai`;

export type ExpertMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
};

// ✅ on vise bien sous 4000 chars côté backend
const PROMPT_MAX = 2500;

// ✅ AJOUT UNIQUE: clé de persistance analysisId (pour hydration après refresh)
const EXPERT_ANALYSIS_ID_KEY = "artisanpro_expert_analysis_id";

function truncateString(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 30) + "\n...[TRUNCATED]";
}

export default function ExpertChatPanel({
  analysisId,
  setAnalysisId,
  messages,
  setMessages,
}: {
  analysisId: string | null;
  setAnalysisId: (id: string | null) => void;
  messages: ExpertMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ExpertMessage[]>>;
}) {
  const { accessToken } = useAuth();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const getWelcomeMessage = useCallback(() => {
    if (analysisId) {
      return "Analyse expert activée ! Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?";
    }
    return "Mode Expert IA activé. Dis-moi ce que tu veux optimiser (TVA, charges, marge, trésorerie).";
  }, [analysisId]);

  // ✅ AJOUT UNIQUE: au mount, tenter de restaurer analysisId si absent (permet history sans repasser par Compta)
  useEffect(() => {
    if (analysisId) return;
    try {
      const saved = localStorage.getItem(EXPERT_ANALYSIS_ID_KEY);
      if (saved && saved.trim().length > 0) {
        setAnalysisId(saved.trim());
      }
    } catch {
      // best effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ AJOUT UNIQUE: persister analysisId quand il change
  useEffect(() => {
    try {
      if (analysisId && analysisId.trim().length > 0) {
        localStorage.setItem(EXPERT_ANALYSIS_ID_KEY, analysisId.trim());
      }
    } catch {
      // best effort
    }
  }, [analysisId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const clearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: getWelcomeMessage(),
        timestamp: new Date(),
      },
    ]);
  };

  const pollJobStatus = useCallback(
    async (jobId: string) => {
      let delayMs = 1500;
      const maxDelayMs = 12_000;

      const schedule = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fetch(`${AI_URL}/status/${jobId}`, {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
        });

        if (res.status === 304) {
          await schedule(delayMs);
          continue;
        }

        if (res.status === 429) {
          delayMs = Math.min(maxDelayMs, delayMs * 2);
          await schedule(delayMs);
          continue;
        }

        if (!res.ok) throw await toApiRequestError(res);

        const data = (await res.json()) as any;
        const status = data?.status;

        if (status === "completed") {
          // ✅ MODIF UNIQUE: normaliser la sortie pour éviter l'affichage { "response": "..." }
          const raw =
            data?.result?.text ??
            data?.result?.response ??
            data?.result ??
            "Réponse reçue.";

          const normalized =
            typeof raw === "string"
              ? raw
              : typeof raw === "object" &&
                  raw !== null &&
                  "response" in raw
                ? String((raw as any).response ?? "")
                : String(raw);

          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: normalized,
              timestamp: new Date(),
            },
          ]);

          setIsLoading(false);
          return;
        }

        if (status === "failed") {
          const msg =
            data?.error?.message ||
            data?.error ||
            "Une erreur est survenue côté IA.";

          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: String(msg),
              timestamp: new Date(),
            },
          ]);

          setIsLoading(false);
          return;
        }

        await schedule(delayMs);
      }
    },
    [accessToken, setMessages]
  );

  const send = async () => {
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
      const finalPrompt = truncateString(q, PROMPT_MAX);

      const payload = {
        analysisId,
        prompt: finalPrompt,
      };

      const res = await fetch(`${AI_URL}/expert/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw await toApiRequestError(res);

      const json = (await res.json()) as AiRunResponse;
      const jobId = (json as any)?.jobId;

      if (!jobId) {
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: "Erreur: jobId manquant.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      await pollJobStatus(String(jobId));
    } catch (e) {
      const err = e as ApiRequestError;
      setIsLoading(false);

      let msg = err.message || "Erreur lors du traitement.";
      if ((err as any).code === "quota_exceeded") {
        msg = "Quota mensuel atteint. Passe en PRO pour continuer.";
      } else if ((err as any).status === 429) {
        msg = "Trop de requêtes. Réessaie dans quelques secondes.";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: msg,
          timestamp: new Date(),
        },
      ]);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const headerTitle = useMemo(() => {
    if (analysisId) return "Expert IA (Compta)";
    return "Expert IA";
  }, [analysisId]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="font-black text-slate-900">{headerTitle}</div>
        <button
          onClick={clearChat}
          className="p-2 rounded-xl hover:bg-slate-100"
          aria-label="Effacer"
          title="Effacer"
        >
          <Trash2 className="w-5 h-5 text-slate-700" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-2 ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.role !== "user" && (
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-900 border"
              }`}
            >
              {m.content}
            </div>

            {m.role === "user" && (
              <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-800 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border text-slate-900 rounded-2xl px-4 py-3 text-sm shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyse en cours...
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-white">
        <div className="flex items-center gap-2">
          <input
            id="expert-chat-input"
            name="expertChatInput"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ex: TVA"
            className="flex-1 px-4 py-3 rounded-2xl border bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900"
            disabled={isLoading}
          />
          <button
            onClick={() => void send()}
            disabled={isLoading || !input.trim()}
            className="px-4 py-3 rounded-2xl bg-slate-900 text-white font-black disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}