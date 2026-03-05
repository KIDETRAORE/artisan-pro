import React, { useEffect, useRef, useState } from "react";
import { MessageSquare, TrendingUp } from "lucide-react";
import ExpertChatPanel from "./ExpertChatPanel";
import AiModePanel from "./AiModePanel";
import { fetchWithAuth } from "../../auth/fetchWithAuth";

export type ExpertTab = "chat" | "strategy";

export type ExpertMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type ExpertHistoryItem = {
  id?: string;
  role: string;
  content: string;
  createdAt?: string;
};

type ExpertConversationResponse = {
  success: boolean;
  messages?: ExpertHistoryItem[];
};

export default function ExpertHubPanel({
  activeTab,
  onChangeTab,
  analysisId,
  setAnalysisId,
  messages,
  setMessages,
}: {
  activeTab: ExpertTab;
  onChangeTab: (tab: ExpertTab) => void;

  analysisId: string | null;
  setAnalysisId: (id: string | null) => void;

  messages: ExpertMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ExpertMessage[]>>;
}) {
  const hydratedKeyRef = useRef<string | null>(null);
  const [hydrationDone, setHydrationDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const key =
      analysisId && analysisId.trim().length > 0 ? analysisId.trim() : "last";

    if (hydratedKeyRef.current === key) {
      setHydrationDone(true);
      return;
    }
    hydratedKeyRef.current = key;

    (async () => {
      try {
        // ✅ MODIF UNIQUE : on hydrate même si seul le message "welcome" est présent
        const hasRealMessages =
          Array.isArray(messages) && messages.some((m) => m.id !== "welcome");

        if (hasRealMessages) {
          return;
        }

        const url =
          key !== "last"
            ? `/ai/expert/history?analysisId=${encodeURIComponent(key)}`
            : `/ai/expert/history`;

        const data = await fetchWithAuth<ExpertConversationResponse>(url, {
          method: "GET",
        });

        if (cancelled) return;

        const raw = Array.isArray(data?.messages) ? data.messages : [];
        if (raw.length === 0) return;

        const mapped: ExpertMessage[] = raw
          .map((m) => {
            const role: ExpertMessage["role"] =
              m.role === "user" ? "user" : "assistant";

            return {
              id: String(m.id ?? `h-${Math.random().toString(16).slice(2)}`),
              role,
              content: String(m.content ?? ""),
              timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
            };
          })
          .filter((m) => m.content.trim().length > 0);

        if (mapped.length > 0) {
          setMessages(mapped);
        }
      } catch {
        // best effort
      } finally {
        if (!cancelled) setHydrationDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [analysisId, messages, setMessages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 p-3 bg-white border-b border-slate-100">
        <button
          onClick={() => onChangeTab("chat")}
          className={`flex-1 px-3 py-2 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition ${
            activeTab === "chat"
              ? "bg-slate-900 text-white"
              : "bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
        >
          <MessageSquare size={14} />
          Chat Expert
        </button>

        <button
          onClick={() => onChangeTab("strategy")}
          className={`flex-1 px-3 py-2 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition ${
            activeTab === "strategy"
              ? "bg-slate-900 text-white"
              : "bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
        >
          <TrendingUp size={14} />
          Stratégie
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        {activeTab === "chat" ? (
          hydrationDone ? (
            <ExpertChatPanel
              analysisId={analysisId}
              setAnalysisId={setAnalysisId}
              messages={messages}
              setMessages={setMessages}
            />
          ) : (
            <div className="p-4 text-sm text-slate-600">Chargement…</div>
          )
        ) : (
          <AiModePanel />
        )}
      </div>
    </div>
  );
}