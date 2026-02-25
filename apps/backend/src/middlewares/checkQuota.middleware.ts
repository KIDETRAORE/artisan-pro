import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

/**
 * checkQuota (P1)
 * Pré-check quota AVANT un appel IA (ici: vision)
 * - Source de vérité plan/status: subscriptions
 * - Source de vérité quota: ai_quota
 *
 * ⚠️ La consommation réelle du quota doit être faite APRÈS succès dans le controller
 * (via quotaService.recordUsage -> RPC consume_ai_quota)
 */
export const checkQuota = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    /**
     * 1) Subscription (PRO actif => bypass quota)
     */
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) {
      logger.error("checkQuota: subscriptions lookup error", {
        userId,
        message: subErr.message,
      });
      return res.status(500).json({ success: false, error: "Quota check failed" });
    }

    const plan = String(sub?.plan ?? "free").toLowerCase();
    const status = String(sub?.status ?? "inactive").toLowerCase();

    const isProActive = plan === "pro" && (status === "active" || status === "trialing");
    if (isProActive) return next();

    /**
     * 2) Quota (ai_quota)
     */
    const { data: quota, error: quotaErr } = await supabaseAdmin
      .from("ai_quota")
      .select("monthly_limit, used, reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (quotaErr) {
      logger.error("checkQuota: ai_quota lookup error", {
        userId,
        message: quotaErr.message,
      });
      return res.status(500).json({ success: false, error: "Quota check failed" });
    }

    if (!quota) {
      // Pas de ligne quota => on bloque proprement (ou tu peux choisir de l'initialiser ailleurs)
      return res.status(403).json({
        success: false,
        error: "Quota introuvable. Veuillez réessayer.",
      });
    }

    const limit = Number(quota.monthly_limit ?? 0);
    let used = Number(quota.used ?? 0);

    /**
     * 3) Reset si nécessaire (reset_at dépassé)
     * Standard: reset au 1er jour du mois suivant
     */
    const now = new Date();
    const resetAt = quota.reset_at ? new Date(quota.reset_at) : null;

    if (resetAt && now > resetAt) {
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const { error: resetErr } = await supabaseAdmin
        .from("ai_quota")
        .update({
          used: 0,
          reset_at: nextReset.toISOString(),
        })
        .eq("user_id", userId);

      if (resetErr) {
        logger.error("checkQuota: ai_quota reset error", {
          userId,
          message: resetErr.message,
        });
        return res.status(500).json({ success: false, error: "Quota check failed" });
      }

      used = 0;
    }

    /**
     * 4) Pré-check (vision consomme du quota, mais la consommation se fera après succès)
     * Ici: on vérifie juste qu'il reste au moins 1 unité.
     * (Si vision est pondérée > 1, adapte ici selon ton poids.)
     */
    const requiredUnits = 1;

    if (limit > 0 && used + requiredUnits > limit) {
      return res.status(403).json({
        success: false,
        error: "Quota mensuel IA dépassé. Passez au plan PRO.",
        usage: used,
        limit,
        reset_at: quota.reset_at ?? null,
      });
    }

    return next();
  } catch (err: unknown) {
    logger.error("checkQuota: unexpected error", {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ success: false, error: "Quota check failed" });
  }
};