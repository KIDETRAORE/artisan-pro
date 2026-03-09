// apps/frontend/src/components/ai/AIInsightCard.tsx
import React from "react";
import { useAIInsight } from "../../hooks/useAIInsight";

type Props = {
  title?: string;
  insight?: string | null;
};

export default function AIInsightCard({ title, insight }: Props) {
  const { cleanedInsight, hasInsight } = useAIInsight({ insight });

  if (!hasInsight || !cleanedInsight) return null;

  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
        Conseil IA
      </div>

      {title ? (
        <div className="mt-2 text-sm font-bold text-[var(--theme-text)]">
          {title}
        </div>
      ) : null}

      <div className="mt-2 text-sm leading-relaxed text-[var(--theme-muted)]">
        {cleanedInsight}
      </div>
    </div>
  );
}