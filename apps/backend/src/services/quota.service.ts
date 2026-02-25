import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { consumeAiQuotaOrThrow } from "./quota/consumeQuota";

/**
 * ======================
 * LIMITES PAR PLAN
 * ======================
 * NOTE: dans ton système actuel, PRO est déjà "bypass quota" dans certains middlewares.
 * Ici on garde des limites pour UI/reporting, mais le blocage PRO peut rester géré ailleurs.
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
 * Limites mensuelles indépendantes (basées sur ai_usage)
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

function normalizePlan(plan?: string | null) {
  return String(plan ?? "free").toLowerCase();
}

function normalizeStatus(status?: string | null) {
  return String(status ?? "inactive").toLowerCase();
}

function isProActive(plan: string, status: string) {
  return plan === "pro" && (status === "active" || status === "trialing");
}

/**
 * ======================
 * QUOTA SERVICE
 * ======================
 */
export const quotaService = {
  /**
   * Assure l'existence de ai_quota + synchro monthly_limit
   * + assure reset_at non-null (standard: 1er jour mois suivant)
   */
  async ensureQuotaRow(userId: string) {
    // 1️⃣ Subscription = source de vérité plan/status
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

    // 2️⃣ ai_quota
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

    // 3️⃣ Création si absente
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

      // cache UI (best effort)
      void (async () => {
        try {
          await supabaseAdmin
            .from("profiles")
            .update({
              monthly_quota_used: 0,
              monthly_quota_limit: planLimit,
              quota_reset_at: Math.floor(new Date(defaultResetAt).getTime() / 1000),
            })
            .eq("id", userId);
        } catch {
          /* ignore */
        }
      })();

      return { monthly_limit: planLimit, used: 0, reset_at: defaultResetAt, pro };
    }

    // 4️⃣ Sync limite si plan changé
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

      // cache UI (best effort)
      void (async () => {
        try {
          if (updates.monthly_limit) {
            await supabaseAdmin
              .from("profiles")
              .update({ monthly_quota_limit: planLimit })
              .eq("id", userId);
          }
        } catch {
          /* ignore */
        }
      })();
    }

    return {
      monthly_limit: planLimit,
      used: Number(quota.used ?? 0),
      reset_at: (quota.reset_at as string) ?? defaultResetAt,
      pro,
    };
  },

  /**
   * Pré-check (lecture seule) AVANT appel IA
   * - reset si reset_at dépassé
   * - vérifie cap feature (ai_usage)
   * - vérifie quota global (ai_quota)
   */
  async checkQuota(userId: string, feature: string) {
    const weight = FEATURE_WEIGHTS[feature] ?? 1;
    const q = await this.ensureQuotaRow(userId);

    // PRO actif => pas de quota
    if (q.pro) return { allowed: true as const };

    const limit = Number(q.monthly_limit);
    let used = Number(q.used);
    const resetAt = q.reset_at ? new Date(q.reset_at) : null;

    // reset si nécessaire
    const now = new Date();
    if (resetAt && now > resetAt) {
      const nextReset = nextResetDate(now).toISOString();

      const { error: resetErr } = await supabaseAdmin
        .from("ai_quota")
        .update({ used: 0, reset_at: nextReset })
        .eq("user_id", userId);

      if (resetErr) {
        logger.error("[QuotaService] ai_quota reset error", {
          userId,
          message: resetErr.message,
        });
        throw new Error("ai_quota_reset_error");
      }

      used = 0;
    }

    // Cap feature (mensuel)
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

    // Quota global
    if (limit > 0 && used + weight > limit) {
      return { allowed: false as const, reason: "Quota insuffisant" };
    }

    return { allowed: true as const };
  },

  /**
   * Consommation réelle (APRÈS succès IA)
   * ✅ BLOQUANT : throw si RPC down ou quota dépassé
   * ✅ Atomique via consume_ai_quota
   * ai_usage = log best-effort
   */
  async recordUsage(userId: string, feature: string, input?: string, output?: string) {
    const q = await this.ensureQuotaRow(userId);

    // PRO actif => on peut log, mais on ne consomme pas
    if (q.pro) {
      // log best-effort
      void supabaseAdmin.from("ai_usage").insert({
        user_id: userId,
        feature,
        tokens_estimated: (estimateTokens(input) + estimateTokens(output)) || 0,
      });
      return;
    }

    const weight = FEATURE_WEIGHTS[feature] ?? 1;
    const tokens = estimateTokens(input) + estimateTokens(output);

    // ✅ consommation atomique (source de vérité)
    const result = await consumeAiQuotaOrThrow(userId, weight);

    // log append-only (best-effort)
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

    // cache UI (best effort) — ATTENTION champs corrects
    void (async () => {
      try {
        await supabaseAdmin
          .from("profiles")
          .update({
            monthly_quota_used: result.used,
            monthly_quota_limit: result.monthly_limit,
          })
          .eq("id", userId);
      } catch {
        /* ignore */
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