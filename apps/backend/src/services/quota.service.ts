import { supabaseAdmin } from "./supabaseAdmin.js";

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
  /**
   * Vérifie quota global + caps feature
   * ⚠️ NE CONSOMME RIEN
   */
  async checkAndLockQuota(
    userId: string,
    feature: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const weight = FEATURE_WEIGHTS[feature] ?? 1;

    // 1️⃣ Récupération ou création du quota
    let { data: quota, error } = await supabaseAdmin
      .from("ai_quota")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("[QuotaService] Fetch error:", error);
      return { allowed: false, reason: "Erreur quota utilisateur" };
    }

    if (!quota) {
      const { data: newQuota, error: insertError } = await supabaseAdmin
        .from("ai_quota")
        .insert({
          user_id: userId,
          monthly_limit: 100,
          used: 0,
          reset_at: nextResetDate().toISOString(),
        })
        .select()
        .single();

      if (insertError || !newQuota) {
        console.error("[QuotaService] Create error:", insertError);
        return { allowed: false, reason: "Impossible d'initialiser le quota" };
      }

      quota = newQuota;
    }

    // 2️⃣ Reset mensuel si nécessaire
    const now = new Date();
    const resetAt = new Date(quota.reset_at);

    if (now > resetAt) {
      const nextReset = nextResetDate(now).toISOString();

      const { data: resetQuota, error: resetError } = await supabaseAdmin
        .from("ai_quota")
        .update({
          used: 0,
          reset_at: nextReset,
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (resetError || !resetQuota) {
        console.error("[QuotaService] Reset error:", resetError);
        return { allowed: false, reason: "Erreur reset quota" };
      }

      quota = resetQuota;
    }

    // Début de période courante
    const periodStart = new Date(
      new Date(quota.reset_at).getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    // 3️⃣ Vérification CAP feature
    const cap = FEATURE_CAPS[feature];
    if (cap) {
      const { count, error: countError } = await supabaseAdmin
        .from("ai_usage")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("feature", feature)
        .gte("created_at", periodStart);

      if (countError) {
        console.error("[QuotaService] Cap count error:", countError);
        return { allowed: false, reason: "Erreur limite fonctionnelle" };
      }

      if ((count ?? 0) >= cap) {
        return {
          allowed: false,
          reason: `Limite mensuelle atteinte pour '${feature}' (${cap}).`,
        };
      }
    }

    // 4️⃣ Vérification quota global
    if (quota.used + weight > quota.monthly_limit) {
      return {
        allowed: false,
        reason: `Crédits IA insuffisants (${quota.used}/${quota.monthly_limit}).`,
      };
    }

    return { allowed: true };
  },

  /**
   * Consommation réelle APRÈS succès IA
   */
  async recordUsage(
    userId: string,
    feature: string,
    input?: string,
    output?: string
  ) {
    try {
      const weight = FEATURE_WEIGHTS[feature] ?? 1;
      const costMultiplier = feature === "vision" ? 3 : 1;

      const tokens =
        (estimateTokens(input) + estimateTokens(output)) * costMultiplier;

      // 1️⃣ Incrément quota (RPC atomique)
      const { error: rpcError } = await supabaseAdmin.rpc(
        "increment_quota",
        {
          row_id: userId,
          val: weight,
        }
      );

      if (rpcError) {
        console.error("[QuotaService] RPC error:", rpcError);
        return;
      }

      // 2️⃣ Audit usage
      const { error: insertError } = await supabaseAdmin
        .from("ai_usage")
        .insert({
          user_id: userId,
          feature,
          tokens_estimated: tokens > 0 ? tokens : weight * 100,
        });

      if (insertError) {
        console.error("[QuotaService] Usage insert error:", insertError);
      }

      console.log(
        `[QuotaService] ${userId} → ${feature} (+${weight} pts)`
      );
    } catch (err) {
      console.error("[QuotaService] Record fatal error:", err);
    }
  },

  /**
   * Retour usage + caps pour dashboard
   */
  async getUserQuota(userId: string) {
    const { data: quota, error } = await supabaseAdmin
      .from("ai_quota")
      .select("used, monthly_limit, reset_at")
      .eq("user_id", userId)
      .single();

    if (error || !quota) return null;

    const resetAt = new Date(quota.reset_at);
    const periodStart = new Date(
      resetAt.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: usage } = await supabaseAdmin
      .from("ai_usage")
      .select("feature")
      .eq("user_id", userId)
      .gte("created_at", periodStart);

    const counts: Record<string, number> = {};
    usage?.forEach((u) => {
      counts[u.feature] = (counts[u.feature] || 0) + 1;
    });

    return {
      ...quota,
      feature_usage: counts,
      feature_caps: FEATURE_CAPS,
    };
  },
};
