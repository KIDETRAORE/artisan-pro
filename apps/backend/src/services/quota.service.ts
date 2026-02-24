import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { consumeAiQuotaOrThrow } from "./quota/consumeQuota";

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
 * 1 appel IA = N unités
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
 * Limites mensuelles indépendantes
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

function nextResetDate(from = new Date()) {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

function normalizePlan(plan?: string | null) {
  return String(plan ?? "free").toLowerCase();
}

function normalizeStatus(status?: string | null) {
  return String(status ?? "inactive").toLowerCase();
}

/**
 * ======================
 * QUOTA SERVICE
 * ======================
 */
export const quotaService = {
  /**
   * Assure l'existence de ai_quota + synchro monthly_limit
   */
  async ensureQuotaRow(userId: string) {
    // 1️⃣ Subscription = source de vérité plan
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) {
      logger.error("[QuotaService] subscriptions lookup error", { userId, subErr });
      throw new Error("subscriptions_lookup_error");
    }

    const plan = normalizePlan(sub?.plan);
    const status = normalizeStatus(sub?.status);
    const isProActive = plan === "pro" && (status === "active" || status === "trialing");
    const planLimit = PLAN_LIMITS[isProActive ? "pro" : "free"];

    // 2️⃣ ai_quota
    const { data: quota, error: quotaErr } = await supabaseAdmin
      .from("ai_quota")
      .select("user_id, monthly_limit, used, reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (quotaErr) {
      logger.error("[QuotaService] ai_quota lookup error", { userId, quotaErr });
      throw new Error("ai_quota_lookup_error");
    }

    // 3️⃣ Création si absente
    if (!quota) {
      const resetAt = nextResetDate().toISOString();

      const { error: insertErr } = await supabaseAdmin.from("ai_quota").insert({
        user_id: userId,
        monthly_limit: planLimit,
        used: 0,
        reset_at: resetAt,
      });

      if (insertErr) {
        logger.error("[QuotaService] ai_quota insert error", { userId, insertErr });
        throw new Error("ai_quota_insert_error");
      }

      // cache UI (best effort)
      void (async () => {
        try {
          await supabaseAdmin
            .from("profiles")
            .update({
              monthly_quota_used: 0,
              monthly_quota_limit: planLimit,
              quota_reset_at: Math.floor(new Date(resetAt).getTime() / 1000),
            })
            .eq("id", userId);
        } catch {
          /* ignore */
        }
      })();

      return { monthly_limit: planLimit, used: 0, reset_at: resetAt };
    }

    // 4️⃣ Sync limite si plan changé
    if (Number(quota.monthly_limit) !== planLimit) {
      const { error: updErr } = await supabaseAdmin
        .from("ai_quota")
        .update({ monthly_limit: planLimit })
        .eq("user_id", userId);

      if (updErr) {
        logger.error("[QuotaService] ai_quota update limit error", { userId, updErr });
        throw new Error("ai_quota_update_limit_error");
      }

      // cache UI
      void (async () => {
        try {
          await supabaseAdmin
            .from("profiles")
            .update({ monthly_quota_limit: planLimit })
            .eq("id", userId);
        } catch {
          /* ignore */
        }
      })();
    }

    return {
      monthly_limit: planLimit,
      used: Number(quota.used ?? 0),
      reset_at: quota.reset_at as string,
    };
  },

  /**
   * Vérification lecture seule (pré-call IA)
   */
  async checkQuota(userId: string, feature: string) {
    const weight = FEATURE_WEIGHTS[feature] ?? 1;
    const quota = await this.ensureQuotaRow(userId);

    const limit = Number(quota.monthly_limit);
    const used = Number(quota.used);

    // Cap feature
    const cap = FEATURE_CAPS[feature];
    if (cap) {
      const periodStart = new Date(
        new Date(quota.reset_at).getFullYear(),
        new Date(quota.reset_at).getMonth() - 1,
        1
      ).toISOString();

      const { count, error } = await supabaseAdmin
        .from("ai_usage")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("feature", feature)
        .gte("created_at", periodStart);

      if (error || (count ?? 0) >= cap) {
        return { allowed: false as const, reason: "Cap feature atteint" };
      }
    }

    if (limit > 0 && used + weight > limit) {
      return { allowed: false as const, reason: "Quota insuffisant" };
    }

    return { allowed: true as const };
  },

  /**
   * Consommation réelle (POST IA)
   */
  async recordUsage(userId: string, feature: string, input?: string, output?: string) {
    try {
      await this.ensureQuotaRow(userId);

      const weight = FEATURE_WEIGHTS[feature] ?? 1;
      const tokens =
        estimateTokens(input) + estimateTokens(output);

      // 🔒 Incrément atomique
      const result = await consumeAiQuotaOrThrow(userId, weight);

      // Log append-only
      await supabaseAdmin.from("ai_usage").insert({
        user_id: userId,
        feature,
        tokens_estimated: tokens > 0 ? tokens : weight * 100,
      });

      // cache UI
      void (async () => {
        try {
          await supabaseAdmin
            .from("profiles")
            .update({
              monthly_quota_used: result.used,
              monthly_quota_limit: result.limit,
            })
            .eq("id", userId);
        } catch {
          /* ignore */
        }
      })();
    } catch (err: unknown) {
      logger.error("[QuotaService] recordUsage error", { userId, feature, err });
    }
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