// apps/frontend/src/hooks/useAIInsight.ts
import { useMemo } from "react";

type UseAIInsightParams = {
  insight?: string | null;
};

type UseAIInsightResult = {
  rawInsight: string | null;
  cleanedInsight: string | null;
  hasInsight: boolean;
};

function normalizeInsight(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();

  if (!cleaned) return null;

  const lowered = cleaned.toLowerCase();

  if (
    lowered === "null" ||
    lowered === "undefined" ||
    lowered === "none" ||
    lowered === "n/a"
  ) {
    return null;
  }

  return cleaned;
}

export function useAIInsight({
  insight,
}: UseAIInsightParams): UseAIInsightResult {
  return useMemo(() => {
    const cleanedInsight = normalizeInsight(insight);

    return {
      rawInsight: typeof insight === "string" ? insight : null,
      cleanedInsight,
      hasInsight: !!cleanedInsight,
    };
  }, [insight]);
}