import React from "react";
import { MessageSquare, TrendingUp } from "lucide-react";
import ExpertChatPanel from "./ExpertChatPanel";
import AiModePanel from "./AiModePanel";

export type ExpertTab = "chat" | "strategy";

export default function ExpertHubPanel({
  activeTab,
  onChangeTab,
}: {
  activeTab: ExpertTab;
  onChangeTab: (tab: ExpertTab) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {activeTab === "chat" ? <ExpertChatPanel /> : <AiModePanel />}
      </div>
    </div>
  );
}