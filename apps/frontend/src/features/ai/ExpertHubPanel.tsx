import React, { useEffect } from "react";
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
  role: "user" | "assistant";
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

  // ✅ Option B: source unique remonte au parent
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
  // ✅ Hydration au mount / quand analysisId change
  useEffect(() => {
    if (!analysisId) return;

    let cancelled = false;

    (async () => {
      try {
        const data = await fetchWithAuth<ExpertConversationResponse>(
          `/ai/expert/history?analysisId=${encodeURIComponent(analysisId)}`,
          { method: "GET" }
        );

        if (cancelled) return;

        const raw = Array.isArray(data?.messages) ? data.messages : [];

        // Si pas d’historique, on ne casse pas l’UI (on garde les messages actuels)
        if (raw.length === 0) return;

        const mapped: ExpertMessage[] = raw.map((m) => ({
          id: String(m.id ?? `h-${Math.random().toString(16).slice(2)}`),
          role: m.role,
          content: String(m.content ?? ""),
          timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
        }));

        setMessages(mapped);
      } catch {
        // best effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [analysisId, setMessages]);

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
          <ExpertChatPanel
            analysisId={analysisId}
            setAnalysisId={setAnalysisId}
            messages={messages}
            setMessages={setMessages}
          />
        ) : (
          <AiModePanel />
        )}
      </div>
    </div>
  );
}