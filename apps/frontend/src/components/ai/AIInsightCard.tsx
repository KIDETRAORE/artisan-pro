import React from "react";

type Props = {
  title?: string;
  insight?: string | null;
};

export default function AIInsightCard({ title, insight }: Props) {
  if (!insight) return null;

  return (
    <div className="mt-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
        ⚡ IA Insight
      </div>

      {title && (
        <div className="mt-1 text-xs font-bold text-[var(--theme-text)]">
          {title}
        </div>
      )}

      <div className="mt-1 text-xs text-[var(--theme-muted)] leading-relaxed">
        {insight}
      </div>
    </div>
  );
}
