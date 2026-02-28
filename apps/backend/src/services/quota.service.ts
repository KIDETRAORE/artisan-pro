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

/**
 * ======================
 * UTILS
 * ======================
 */
function estimateTokens(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function firstDayOfMonthISO(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function nextResetDate(from = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

/**
 * ======================
 * QUOTA SERVICE
 * ======================
 */
export const quotaService = {
  async ensureQuotaRow(userId: string) {
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

    const planLimit = PLAN_LIMITS[pro ? "pro" : "free"];

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

    const defaultResetAt = nextResetDate().toISOString();

    if (!quota) {
      const { error: insertErr } = await supabaseAdmin.from("ai_quota").insert({
        user_id: userId,
        monthly_limit: planLimit,
        used: 0,
        reset_at: defaultResetAt,
      });

      if (insertErr) {
        logger.error("[QuotaService] ai_quota insert error", {
          userId,
          message: insertErr.message,
        });
        throw new Error("ai_quota_insert_error");
      }

      return { monthly_limit: planLimit, used: 0, reset_at: defaultResetAt, pro };
    }

    const updates: Record<string, unknown> = {};
    if (Number(quota.monthly_limit) !== planLimit) {
      updates.monthly_limit = planLimit;
    }
    if (!quota.reset_at) {
      updates.reset_at = defaultResetAt;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await supabaseAdmin
        .from("ai_quota")
        .update(updates)
        .eq("user_id", userId);

      if (updErr) {
        logger.error("[QuotaService] ai_quota update error", {
          userId,
          message: updErr.message,
        });
        throw new Error("ai_quota_update_error");
      }
    }

    return {
      monthly_limit: planLimit,
      used: Number(quota.used ?? 0),
      reset_at: (quota.reset_at as string) ?? defaultResetAt,
      pro,
    };
  },

  async checkQuota(userId: string, feature: string) {
    const weight = FEATURE_WEIGHTS[feature] ?? 1;
    const q = await this.ensureQuotaRow(userId);

    if (q.pro) return { allowed: true as const };

    const limit = Number(q.monthly_limit);
    let used = Number(q.used);
    const resetAt = q.reset_at ? new Date(q.reset_at) : null;

    const now = new Date();
    if (resetAt && now >= resetAt) {
      used = 0;
    }

    const cap = FEATURE_CAPS[feature];
    if (cap) {
      const periodStart = firstDayOfMonthISO(now);

      const { count, error } = await supabaseAdmin
        .from("ai_usage")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("feature", feature)
        .gte("created_at", periodStart);

      if (error) {
        logger.error("[QuotaService] ai_usage cap lookup error", {
          userId,
          feature,
          message: error.message,
        });
        throw new Error("ai_usage_cap_lookup_error");
      }

      if ((count ?? 0) >= cap) {
        return { allowed: false as const, reason: "Cap feature atteint" };
      }
    }

    if (limit > 0 && used + weight > limit) {
      return { allowed: false as const, reason: "Quota insuffisant" };
    }

    return { allowed: true as const };
  },

  async recordUsage(userId: string, feature: string, input?: string, output?: string) {
    const q = await this.ensureQuotaRow(userId);

    if (q.pro) {
      void supabaseAdmin.from("ai_usage").insert({
        user_id: userId,
        feature,
        tokens_estimated: (estimateTokens(input) + estimateTokens(output)) || 0,
      });
      return;
    }

    const rawWeight = FEATURE_WEIGHTS[feature] ?? 1;
    const weight = Math.max(1, Number(rawWeight) || 1);
    const tokens = estimateTokens(input) + estimateTokens(output);

    try {
      await consumeAiQuotaOrThrow(userId, weight);
    } catch (err: any) {
      const msg = String(err?.message ?? "");

      if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("exceed")) {
        throw new QuotaError("quota_exceeded");
      }

      logger.error("[QuotaService] consume_ai_quota failed", {
        userId,
        feature,
        weight,
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