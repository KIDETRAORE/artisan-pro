// apps/frontend/src/pages/Assistant.tsx

import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Send,
  Bot,
  User,
  Paperclip,
  Loader2,
  Sparkles,
  Trash2,
  ArrowRight,
  FileText,
  Camera,
  PieChart,
  Briefcase,
  Receipt,
} from "lucide-react";
import { useUser } from "../context/user.context";
import { useAuth } from "../store/auth.store";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { ApiRequestError } from "../utils/apiRequestError";
import type { AiRunResponse } from "../api/types";

const API_URL = "http://localhost:8080/ai";

interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

type ExpertChatEventDetail = {
  analysisData?: unknown;
  message?: string;
};

function stringifyResult(result: unknown): string {
  if (result === null || result === undefined) return "";
  if (typeof result === "string") return result;

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

const QUICK_ACTIONS = [
  {
    title: "Nouveau devis",
    description: "Créer ou reprendre un devis rapidement.",
    to: "/devis",
    icon: FileText,
  },
  {
    title: "Scanner / Vision",
    description: "Analyser une image ou un document.",
    to: "/vision",
    icon: Camera,
  },
  {
    title: "Suivi compta",
    description: "Relances, échéances, trésorerie et anomalies comptables.",
    to: "/compta",
    icon: PieChart,
  },
  {
    title: "Chantiers",
    description: "Suivre les projets, marges, achats et ventes chantier.",
    to: "/projects",
    icon: Briefcase,
  },
  {
    title: "Factures clients",
    description: "Consulter et gérer la nouvelle base canonique client.",
    to: "/sales-invoices",
    icon: Receipt,
  },
  {
    title: "Factures fournisseurs",
    description: "Consulter et gérer la nouvelle base canonique fournisseur.",
    to: "/purchase-bills",
    icon: Receipt,
  },
  {
    title: "Paiements",
    description: "Suivre les encaissements et décaissements.",
    to: "/payments",
    icon: Receipt,
  },
];

export default function Assistant() {
  const { userData } = useUser();
  const { accessToken } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [analysisContext, setAnalysisContext] = useState<unknown>(null);

  const getWelcomeMessage = useCallback(
    (customText?: string): Message => ({
      id: Date.now().toString(),
      role: "assistant",
      content:
        customText ||
        `Bonjour ${
          userData?.name || "Artisan"
        } ! Je suis votre expert ArtisanPro. Je peux vous aider à analyser vos devis, calculer vos marges ou répondre à vos questions comptables.`,
      timestamp: new Date(),
    }),
    [userData?.name]
  );

  useEffect(() => {
    if (messages.length === 0) setMessages([getWelcomeMessage()]);

    const handleExpertEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ExpertChatEventDetail>;
      const { analysisData, message } = customEvent.detail || {};

      if (analysisData !== undefined) {
        setAnalysisContext(analysisData);
      }

      const expertMsg: Message = {
        id: `expert-${Date.now()}`,
        role: "assistant",
        content: message || "Contexte chargé. Pose ta question.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, expertMsg]);
    };

    window.addEventListener("openExpertChat", handleExpertEvent);
    return () =>
      window.removeEventListener("openExpertChat", handleExpertEvent);
  }, [getWelcomeMessage, messages.length]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, []);

  const clearPoll = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    isPollingRef.current = false;
  };

  const startPolling = (jobId: string) => {
    clearPoll();

    if (isPollingRef.current) return;
    isPollingRef.current = true;

    let delayMs = 1000;
    const maxDelayMs = 10000;

    const tick = async () => {
      try {
        const res = await fetch(`${API_URL}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.status === 304) return;

        if (res.status === 429) {
          clearPoll();
          delayMs = Math.min(maxDelayMs, delayMs * 2);
          isPollingRef.current = true;
          pollIntervalRef.current = setInterval(tick, delayMs);
          return;
        }

        const data = await res.json();

        if (data.status === "completed") {
          clearPoll();

          const botMsg: Message = {
            id: Date.now().toString(),
            role: "assistant",
            content: stringifyResult(data.result),
            timestamp: new Date(),
          };

          setMessages((prev) => [...prev, botMsg]);
          setIsLoading(false);
        } else if (data.status === "failed") {
          clearPoll();

          const botMsg: Message = {
            id: Date.now().toString(),
            role: "assistant",
            content: data.error || "Désolé, l'analyse a échoué.",
            timestamp: new Date(),
          };

          setMessages((prev) => [...prev, botMsg]);
          setIsLoading(false);
        }
      } catch {
        clearPoll();
        setIsLoading(false);
      }
    };

    void tick();
    pollIntervalRef.current = setInterval(tick, delayMs);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      let finalPrompt = input;
      if (analysisContext) {
        finalPrompt = `CONTEXTE (JSON): ${JSON.stringify(
          analysisContext
        )}\n\nQUESTION: ${input}`;
      }

      const data = await fetchWithAuth<AiRunResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ type: "assistant", prompt: finalPrompt }),
      });

      if (data?.jobId) {
        startPolling(String(data.jobId));
      } else {
        const botMsg: Message = {
          id: `noj-${Date.now()}`,
          role: "assistant",
          content: "Le backend n’a pas renvoyé de jobId.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMsg]);
        setIsLoading(false);
      }
    } catch (e) {
      const err = e as ApiRequestError;

      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content:
          err.code === "quota_exceeded"
            ? "Quota atteint. Passez en PRO pour continuer."
            : err.message ||
              "Désolé, j'ai rencontré une erreur technique. Vérifiez votre connexion au serveur.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMsg]);
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 px-4 pb-6 pt-2 duration-700">
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-[var(--theme-text)]">
          Actions
        </h2>
        <p className="text-sm text-[var(--theme-muted)]">
          Lance rapidement une action métier ou demande un appui IA contextuel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {QUICK_ACTIONS.map((action) => {
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

              <div className="mt-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--theme-primary)]">
                Ouvrir <ArrowRight size={14} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-2 pt-2">
        <div className="flex items-center gap-2">
          <div
            className="rounded-lg p-1.5"
            style={{ backgroundColor: "var(--theme-primary)" }}
          >
            <Sparkles
              className="text-[var(--theme-primary-contrast)]"
              size={14}
            />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-[var(--theme-text)]">
            {analysisContext ? "Analyse Expert Active" : "Assistant d’action IA"}
          </span>
        </div>

        <button
          onClick={() => {
            setMessages([getWelcomeMessage()]);
            setAnalysisContext(null);
          }}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter text-[var(--theme-muted)] transition-colors hover:text-red-500"
        >
          <Trash2 size={12} /> Effacer
        </button>
      </div>

      <div className="flex h-[calc(100vh-360px)] min-h-[420px] flex-col overflow-hidden rounded-[2.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-2xl">
        <div
          ref={scrollRef}
          className="flex-1 space-y-6 overflow-y-auto bg-[var(--theme-bg)] p-4 md:p-8"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`flex max-w-[90%] gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-sm ${
                    msg.role === "user"
                      ? "border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)]"
                      : "text-[var(--theme-primary-contrast)]"
                  }`}
                  style={
                    msg.role === "user"
                      ? undefined
                      : { backgroundColor: "var(--theme-primary)" }
                  }
                >
                  {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>

                <div
                  className={`whitespace-pre-wrap rounded-2xl p-4 text-[13px] leading-relaxed shadow-sm ${
                    msg.role === "user"
                      ? "rounded-tr-none font-medium text-white"
                      : "rounded-tl-none border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)]"
                  }`}
                  style={
                    msg.role === "user"
                      ? { backgroundColor: "var(--theme-primary)" }
                      : undefined
                  }
                >
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex animate-pulse justify-start">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--theme-primary-contrast)]"
                  style={{ backgroundColor: "var(--theme-primary)" }}
                >
                  <Loader2 size={16} className="animate-spin" />
                </div>
                <div className="text-[11px] font-bold italic uppercase tracking-wider text-[var(--theme-muted)]">
                  Expertise en cours...
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  analysisContext
                    ? "Posez une question sur l'analyse..."
                    : "Demandez une aide rapide sur un devis, une facture ou un chantier..."
                }
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] py-4 pl-6 pr-12 text-sm text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-muted)] focus:bg-[var(--theme-card)]"
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-primary)]"
                onClick={() => {
                  // Optionnel: futur upload dans le chat
                }}
              >
                <Paperclip size={20} />
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="rounded-2xl p-4 text-white shadow-lg transition-all active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--theme-primary)" }}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}