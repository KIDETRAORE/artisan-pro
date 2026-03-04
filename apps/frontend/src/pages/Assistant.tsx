import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Paperclip,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useUser } from "../context/user.context";
import { useAuth } from "../store/auth.store";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { ApiRequestError } from "../utils/apiRequestError";

// ✅ AJOUT
import type { AiRunResponse } from "../api/types";

const API_URL = "http://localhost:8080/ai";

interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

function stringifyResult(result: any): string {
  if (result === null || result === undefined) return "";
  if (typeof result === "string") return result;

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export default function Assistant() {
  const { userData } = useUser();
  const { accessToken } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [analysisContext, setAnalysisContext] = useState<any>(null);

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

  // Init + écoute Mode Expert (Compta / Vision / autres)
  useEffect(() => {
    if (messages.length === 0) setMessages([getWelcomeMessage()]);

    const handleExpertEvent = (e: any) => {
      const { analysisData, message } = e.detail || {};
      if (analysisData) setAnalysisContext(analysisData);

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

  // Auto-scroll
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  // ✅ Anti multi-poll + cleanup
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
    // ✅ Stop ancien poll si existant + reset flag
    clearPoll();

    // ✅ Empêche plusieurs polls simultanés
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    // ✅ Backoff 429 : 1s → 2s → 4s → 8s → 10s (max)
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

    // Démarrage immédiat, puis interval
    tick();
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
      // ✅ Prompt enrichi si contexte (vision/compta/etc.)
      let finalPrompt = input;
      if (analysisContext) {
        finalPrompt = `CONTEXTE (JSON): ${JSON.stringify(
          analysisContext
        )}\n\nQUESTION: ${input}`;
      }

      // ✅ MODIF UNIQUE: /ai/run -> /ai/chat
      const data = await fetchWithAuth<AiRunResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ type: "assistant", prompt: finalPrompt }),
      });

      if (data?.jobId) {
        startPolling(String(data.jobId));
      } else {
        // ✅ pas de throw new Error : on gère via message UI
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
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700 px-4">
      {/* Barre d'outils supérieure */}
      <div className="flex justify-between items-center mb-4 px-2 pt-2">
        <div className="flex items-center gap-2">
          <div className="bg-blue-500 p-1.5 rounded-lg">
            <Sparkles className="text-white" size={14} />
          </div>
          <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
            {analysisContext ? "Analyse Expert Active" : "Expert AI Mode"}
          </span>
        </div>

        <button
          onClick={() => {
            setMessages([getWelcomeMessage()]);
            setAnalysisContext(null);
          }}
          className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-red-500 transition-colors tracking-tighter"
        >
          <Trash2 size={12} /> Effacer
        </button>
      </div>

      <div className="flex-1 bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 flex flex-col overflow-hidden mb-4">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-slate-50/30"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`flex gap-3 max-w-[90%] ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                    msg.role === "user"
                      ? "bg-white text-slate-600 border border-slate-200"
                      : "bg-slate-900 text-white"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User size={16} />
                  ) : (
                    <Bot size={16} />
                  )}
                </div>

                <div
                  className={`p-4 rounded-2xl text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-none font-medium"
                      : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start animate-pulse">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                  <Loader2 size={16} className="animate-spin" />
                </div>
                <div className="text-slate-400 text-[11px] font-bold italic uppercase tracking-wider">
                  Expertise en cours...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Saisie */}
        <div className="p-4 bg-white border-t border-slate-100">
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
                    : "Posez votre question technique..."
                }
                className="w-full pl-6 pr-12 py-4 bg-slate-100 border-2 border-transparent focus:border-blue-500/20 focus:bg-white rounded-2xl transition-all text-sm outline-none"
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
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
              className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-blue-600 disabled:bg-slate-200 transition-all shadow-lg active:scale-95"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}