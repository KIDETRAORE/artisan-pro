// apps/backend/src/services/quota.service.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { consumeAiQuotaOrThrow, QuotaError } from "./quota/consumeQuota";
import { normalizePlan, normalizeStatus, isProActive } from "../domain/plan";

/**
 * ======================
 * LIMITES PAR PLAN
 * ======================
 */
const PLAN_LIMITS: Record<string, number> = {
  free: 100,
  pro: 1000,
};

/**
 * ======================
 * POIDS PAR FEATURE
 * ======================
 */
export const FEATURE_WEIGHTS: Record<string, number> = {
  assistant: 1,
  devis: 2,
  vision: 10,
  compta: 3,
  relance: 1,
  vocal: 1,
};

/**
 * ======================
 * CAPS PAR FEATURE
 * ======================
 */
export const FEATURE_CAPS: Record<string, number> = {
  vision: 15,
  compta: 10,
};

function estimateTokens(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function nextResetDate(from = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

export const quotaService = {
  // ✅ READ-ONLY
  async getQuotaRow(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("ai_quota")
      .select("user_id, monthly_limit, used, reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  },

  /**
   * ✅ DESIGN FINAL: plus de ensure_ai_quota ici.
   * On suppose que la row ai_quota est créée via trigger (handle_new_user).
   * Cette fonction renvoie la “shape” utile au dashboard, mais en 100% read-only.
   */
  async getQuotaSnapshot(userId: string) {
    // 1) Subscriptions
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) {
      logger.error("[QuotaService] subscriptions lookup error", {
        userId,
        message: subErr.message,
      });
      throw new Error("subscriptions_lookup_error");
    }

    const plan = normalizePlan(sub?.plan);
    const status = normalizeStatus(sub?.status);
    const pro = isProActive(plan, status);

    if (pro) {
      return {
        pro: true,
        monthly_limit: PLAN_LIMITS.pro,
        used: 0,
        reset_at: nextResetDate().toISOString(),
      };
    }

    // 2) Quota row (doit exister)
    const { data: quota, error: quotaErr } = await supabaseAdmin
      .from("ai_quota")
      .select("user_id, monthly_limit, used, reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (quotaErr) {
      logger.error("[QuotaService] ai_quota lookup error", {
        userId,
        message: quotaErr.message,
      });
      throw new Error("ai_quota_lookup_error");
    }

    if (!quota) {
      // Ici: trigger manquant / user créé avant trigger / projet mal migré
      throw new Error("quota_row_missing");
    }

    return {
      pro: false,
      monthly_limit: Number(quota.monthly_limit ?? PLAN_LIMITS.free),
      used: Number(quota.used ?? 0),
      reset_at: (quota.reset_at as string) ?? nextResetDate().toISOString(),
    };
  },

  // ✅ 100% READ-ONLY
  async checkQuota(userId: string, feature: string) {
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) {
      return { ok: false as const, code: "quota_check_failed", reason: subErr.message };
    }

    const plan = normalizePlan(sub?.plan);
    const status = normalizeStatus(sub?.status);

    if (isProActive(plan, status)) {
      return { ok: true as const, unlimited: true };
    }

    const { data: quota, error: qErr } = await supabaseAdmin
      .from("ai_quota")
      .select("monthly_limit, used, reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (qErr) {
      return { ok: false as const, code: "quota_check_failed", reason: qErr.message };
    }

    if (!quota) {
      return { ok: false as const, code: "quota_row_missing" };
    }

    const weight = FEATURE_WEIGHTS[feature] ?? 1;

    const limit = Number(quota.monthly_limit ?? 0);
    let used = Number(quota.used ?? 0);
    const resetAt = quota.reset_at ? new Date(quota.reset_at) : null;

    if (resetAt && new Date() >= resetAt) used = 0;

    if (limit > 0 && used + weight > limit) {
      return {
        ok: false as const,
        code: "quota_exceeded",
        used,
        limit,
        weight,
        resetAt: quota.reset_at ?? null,
      };
    }

    return { ok: true as const };
  },

  async recordUsage(userId: string, feature: string, input?: string, output?: string) {
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) {
      logger.error("[QuotaService] subscriptions lookup error (recordUsage)", {
        userId,
        message: subErr.message,
      });
      throw new QuotaError("quota_check_failed");
    }

    const plan = normalizePlan(sub?.plan);
    const status = normalizeStatus(sub?.status);
    const pro = isProActive(plan, status);

    if (pro) {
      void supabaseAdmin.from("ai_usage").insert({
        user_id: userId,
        feature,
        tokens_estimated: (estimateTokens(input) + estimateTokens(output)) || 0,
      });
      return;
    }

    // FREE: row doit exister via trigger
    const { data: quota, error: qErr } = await supabaseAdmin
      .from("ai_quota")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (qErr) {
      logger.error("[QuotaService] ai_quota lookup error (recordUsage)", {
        userId,
        message: qErr.message,
      });
      throw new QuotaError("quota_check_failed");
    }

    if (!quota) {
      throw new QuotaError("quota_row_missing");
    }

    const rawWeight = FEATURE_WEIGHTS[feature] ?? 1;
    const weight = Math.max(1, Number(rawWeight) || 1);
    const tokens = estimateTokens(input) + estimateTokens(output);

    try {
      await consumeAiQuotaOrThrow(userId, weight);
    } catch (err: any) {
      // ✅ MODIF UNIQUE : mapping strict (ne pas convertir "quota_rpc_failed" en quota_exceeded)
      const code = String(err?.code ?? "");
      const msg = String(err?.message ?? "");

      if (code === "quota_exceeded" || msg === "quota_exceeded") {
        throw new QuotaError("quota_exceeded");
      }

      logger.error("[QuotaService] consume_ai_quota failed", {
        userId,
        feature,
        weight,
        code,
        message: msg,
      });

      throw new QuotaError("quota_rpc_failed");
    }

    void (async () => {
      try {
        await supabaseAdmin.from("ai_usage").insert({
          user_id: userId,
          feature,
          tokens_estimated: tokens > 0 ? tokens : weight * 100,
        });
      } catch (err: unknown) {
        logger.warn("[QuotaService] ai_usage insert failed (best effort)", {
          userId,
          feature,
          err,
        });
      }
    })();
  },

  async getUserQuota(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("ai_quota")
      .select("used, monthly_limit, reset_at")
      .eq("user_id", userId)
      .single();

    if (error) return null;
    return data;
  },
};