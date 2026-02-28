// apps/backend/src/services/ai/ai.usage.service.ts
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { logger } from "../../utils/logger";
import { FEATURE_WEIGHTS } from "../quota.service";

export type AiFeature =
  | "vision"
  | "compta"
  | "vocal"
  | "assistant"
  | "devis";

type ConsumeResult = {
  ok: boolean;
  used?: number;
  limit?: number;
  resetAt?: string | null;
};

function normalizeUnits(units: unknown): number {
  const n = Number(units);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/**
 * Consomme le quota IA (source de vérité: ai_quota via RPC).
 * À appeler uniquement APRÈS succès de l'appel IA (post-success).
 */
export async function consumeAiQuota(params: {
  userId: string;
  feature: AiFeature;
  units?: number; // si absent => poids default par feature
}): Promise<ConsumeResult> {
  const { userId, feature } = params;
  const units = normalizeUnits(params.units ?? FEATURE_WEIGHTS[feature] ?? 1);

  try {
    // RPC attend (uid, amt) selon ton doc
    const { data, error } = await supabaseAdmin.rpc("consume_ai_quota", {
      uid: userId,
      amt: units,
    });

    if (error) {
      // Les erreurs "quota exceeded" doivent remonter proprement
      logger.warn("consumeAiQuota: RPC error", {
        userId,
        feature,
        units,
        message: error.message,
      });

      // On laisse le controller décider: généralement 403 quota_exceeded
      throw new Error(error.message);
    }

    // Selon comment tu codes la RPC, data peut être:
    // - boolean
    // - objet { used, limit, reset_at }
    // On supporte les 2 sans casser.
    if (typeof data === "boolean") {
      return { ok: data };
    }

    if (data && typeof data === "object") {
      const used = Number((data as any).used ?? (data as any).monthly_used ?? NaN);
      const limit = Number((data as any).limit ?? (data as any).monthly_limit ?? NaN);
      const resetAt = (data as any).reset_at ?? (data as any).resetAt ?? null;

      return {
        ok: true,
        used: Number.isFinite(used) ? used : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
        resetAt: typeof resetAt === "string" ? resetAt : null,
      };
    }

    return { ok: true };
  } catch (err: unknown) {
    logger.error("consumeAiQuota: unexpected error", {
      userId,
      feature,
      units,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}