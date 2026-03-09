// apps/frontend/src/features/ai/ExpertChatPanel.tsx
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

const PROMPT_MAX = 2500;

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

  const pollAbortRef = useRef<AbortController | null>(null);

  const getWelcomeMessage = useCallback(() => {
    if (analysisId) {
      return "Analyse expert activée ! Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?";
    }
    return "Mode Expert IA activé. Dis-moi ce que tu veux optimiser (TVA, charges, marge, trésorerie).";
  }, [analysisId]);

  useEffect(() => {
    return () => {
      try {
        pollAbortRef.current?.abort();
      } catch {}
    };
  }, []);

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
      try {
        pollAbortRef.current?.abort();
      } catch {}

      const controller = new AbortController();
      pollAbortRef.current = controller;

      let delayMs = 1500;
      const maxDelayMs = 12000;

      const schedule = (ms: number) => new Promise((r) => setTimeout(r, ms));

      while (true) {
        if (controller.signal.aborted) {
          setIsLoading(false);
          return;
        }

        const res = await fetch(`${AI_URL}/status/${jobId}`, {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          setIsLoading(false);
          return;
        }

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

        delayMs = Math.min(maxDelayMs, Math.round(delayMs * 1.15));
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
      const finalPrompt =
        q.length > PROMPT_MAX
          ? q.slice(0, PROMPT_MAX - 30) + "\n...[TRUNCATED]"
          : q;

      const res = await fetch(`${AI_URL}/expert/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisId,
          prompt: finalPrompt,
        }),
      });

      if (!res.ok) throw await toApiRequestError(res);

      const json = (await res.json()) as AiRunResponse;
      const jobId = (json as any)?.jobId;

      if (!jobId) {
        setIsLoading(false);
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
      <div className="flex items-center justify-between px-4 py-3 border-b bg-[var(--theme-card)]">
        <div className="font-black text-[var(--theme-text)]">{headerTitle}</div>
        <button
          onClick={clearChat}
          className="p-2 rounded-xl hover:bg-[var(--theme-bg)]"
        >
          <Trash2 className="w-5 h-5 text-[var(--theme-text)]" />
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
              <div className="w-8 h-8 rounded-xl bg-[var(--theme-primary)] text-white flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                m.role === "user"
                  ? "bg-[var(--theme-primary)] text-white"
                  : "bg-[var(--theme-card)] border text-[var(--theme-text)]"
              }`}
            >
              {m.content}
            </div>

            {m.role === "user" && (
              <div className="w-8 h-8 rounded-xl bg-[var(--theme-bg)] flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--theme-primary)] text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>

            <div className="bg-[var(--theme-card)] border rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyse en cours...
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-[var(--theme-card)]">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ex: TVA"
            className="flex-1 px-4 py-3 rounded-2xl border bg-[var(--theme-bg)] focus:outline-none"
            disabled={isLoading}
          />

          <button
            onClick={() => void send()}
            disabled={isLoading || !input.trim()}
            className="px-4 py-3 rounded-2xl bg-[var(--theme-primary)] text-white font-black disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
