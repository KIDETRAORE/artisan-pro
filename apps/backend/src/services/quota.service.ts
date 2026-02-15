import { supabaseAdmin } from "./supabaseAdmin.js";

/**
 * ======================
 * LIMITES PAR PLAN
 * ======================
 */
const PLAN_LIMITS: Record<string, number> = {
  free: 100,
  pro: 1000,
  pro_plus: 5000,
};

/**
 * ======================
 * RÉFÉRENTIEL DES POIDS
 * ======================
 */
const FEATURE_WEIGHTS: Record<string, number> = {
  assistant: 1,
  devis: 2,
  vision: 10,
  compta: 3,
  relance: 1,
};

/**
 * ======================
 * PLAFONDS PAR FEATURE
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
export function estimateTokens(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function nextResetDate(from = new Date()) {
  return new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
}

/**
 * ======================
 * QUOTA SERVICE
 * ======================
 */
export const quotaService = {

  async checkAndLockQuota(userId: string, feature: string) {

    if (!userId) {
      return { allowed: false, reason: "User ID manquant" };
    }

    const weight = FEATURE_WEIGHTS[feature] ?? 1;

    /**
     * 1️⃣ Récupération abonnement
     */
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .single();

    if (subError || !subscription) {
      return { allowed: false, reason: "Abonnement introuvable" };
    }

    const plan = subscription.plan.toLowerCase();
    const planLimit = PLAN_LIMITS[plan] ?? 100;

    /**
     * 2️⃣ Récupération quota
     */
    let { data: quota, error } = await supabaseAdmin
      .from("ai_quota")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("[QuotaService] Fetch error:", error);
      return { allowed: false, reason: "Erreur quota utilisateur" };
    }

    /**
     * 3️⃣ Création si inexistant
     */
    if (!quota) {
      const { data: newQuota, error: insertError } = await supabaseAdmin
        .from("ai_quota")
        .insert({
          user_id: userId,
          monthly_limit: planLimit,
          used: 0,
          reset_at: nextResetDate().toISOString(),
        })
        .select()
        .single();

      if (insertError || !newQuota) {
        return { allowed: false, reason: "Impossible d'initialiser le quota" };
      }

      quota = newQuota;
    }

    /**
     * 4️⃣ Synchronisation limite si plan changé
     */
    if (quota.monthly_limit !== planLimit) {
      const { data: updatedQuota } = await supabaseAdmin
        .from("ai_quota")
        .update({ monthly_limit: planLimit })
        .eq("user_id", userId)
        .select()
        .single();

      if (updatedQuota) {
        quota = updatedQuota;
      }
    }

    /**
     * 5️⃣ Reset mensuel automatique
     */
    const now = new Date();
    const resetAt = new Date(quota.reset_at);

    if (now > resetAt) {
      const nextReset = nextResetDate(now).toISOString();

      const { data: resetQuota } = await supabaseAdmin
        .from("ai_quota")
        .update({
          used: 0,
          reset_at: nextReset,
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (resetQuota) {
        quota = resetQuota;
      }
    }

    const periodStart = new Date(
      new Date(quota.reset_at).getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    /**
     * 6️⃣ Vérification CAP feature
     */
    const cap = FEATURE_CAPS[feature];

    if (cap) {
      const { count } = await supabaseAdmin
        .from("ai_usage")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("feature", feature)
        .gte("created_at", periodStart);

      if ((count ?? 0) >= cap) {
        return {
          allowed: false,
          reason: `Limite mensuelle atteinte pour '${feature}' (${cap}).`,
        };
      }
    }

    /**
     * 7️⃣ Vérification quota global
     */
    if (quota.used + weight > quota.monthly_limit) {
      return {
        allowed: false,
        reason: `Crédits IA insuffisants (${quota.used}/${quota.monthly_limit}).`,
      };
    }

    return { allowed: true };
  },

  async recordUsage(
    userId: string,
    feature: string,
    input?: string,
    output?: string
  ) {
    try {
      if (!userId) return;

      const weight = FEATURE_WEIGHTS[feature] ?? 1;
      const costMultiplier = feature === "vision" ? 3 : 1;

      const tokens =
        (estimateTokens(input) + estimateTokens(output)) * costMultiplier;

      await supabaseAdmin.rpc("increment_quota", {
        row_id: userId,
        val: weight,
      });

      await supabaseAdmin.from("ai_usage").insert({
        user_id: userId,
        feature,
        tokens_estimated: tokens > 0 ? tokens : weight * 100,
      });

    } catch (err) {
      console.error("[QuotaService] Record fatal error:", err);
    }
  },

  async getUserQuota(userId: string) {
    const { data: quota } = await supabaseAdmin
      .from("ai_quota")
      .select("used, monthly_limit, reset_at")
      .eq("user_id", userId)
      .single();

    return quota ?? null;
  },
};
