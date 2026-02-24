import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

/**
 * quotaMiddleware
 * - Truth plan/status: subscriptions
 * - Truth quota: ai_quota
 * - profiles = cache UI (optionnel)
 *
 * used = nombre d'actions IA (1 appel = 1)
 */
export const quotaMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Utilisateur non authentifié",
      });
    }

    /**
     * 1️⃣ Source de vérité plan : subscriptions
     */
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) {
      logger.error("❌ subscriptions lookup error", { userId, subErr });
      return res.status(500).json({ success: false, error: "Erreur interne" });
    }

    const plan = String(sub?.plan ?? "FREE").toUpperCase();
    const status = String(sub?.status ?? "inactive").toLowerCase();

    const isProActive =
      plan === "PRO" && (status === "active" || status === "trialing");

    if (isProActive) {
      return next(); // PRO actif → pas de quota
    }

    /**
     * 2️⃣ Source de vérité quota : ai_quota
     */
    const { data: quota, error: quotaErr } = await supabaseAdmin
      .from("ai_quota")
      .select("monthly_limit, used, reset_at")
      .eq("user_id", userId)
      .single();

    if (quotaErr || !quota) {
      logger.error("❌ ai_quota lookup error", { userId, quotaErr });
      return res
        .status(404)
        .json({ success: false, error: "Quota introuvable" });
    }

    const limit = Number(quota.monthly_limit ?? 0);
    let used = Number(quota.used ?? 0);

    /**
     * 3️⃣ Reset automatique (reset_at = timestamp)
     */
    const now = new Date();
    const resetAt = quota.reset_at ? new Date(quota.reset_at) : null;

    if (resetAt && now > resetAt) {
      const nextReset = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1
      ); // 1er jour mois suivant

      logger.info("🔄 Reset quota mensuel", {
        userId,
        from: resetAt.toISOString(),
        to: nextReset.toISOString(),
      });

      const { error: resetErr } = await supabaseAdmin
        .from("ai_quota")
        .update({
          used: 0,
          reset_at: nextReset.toISOString(),
        })
        .eq("user_id", userId);

      if (resetErr) {
        logger.error("❌ ai_quota reset error", { userId, resetErr });
        return res
          .status(500)
          .json({ success: false, error: "Erreur interne" });
      }

      /**
       * 🪞 Cache UI (profiles) — best effort
       * Pas de .catch() → PromiseLike safe
       */
      void (async () => {
        try {
          await supabaseAdmin
            .from("profiles")
            .update({
              monthly_quota_used: 0,
              monthly_quota_limit: limit,
              quota_reset_at: Math.floor(
                nextReset.getTime() / 1000
              ), // bigint seconds (cache UI)
              plan,
              subscription_status: status,
            })
            .eq("id", userId);

          logger.info("🪞 profiles cache updated (quota reset)", { userId });
        } catch (e: unknown) {
          logger.warn("⚠️ profiles cache update failed", {
            userId,
            error: e,
          });
        }
      })();

      used = 0; // mise à jour locale
    }

    /**
     * 4️⃣ Check AVANT appel IA
     */
    if (limit > 0 && used >= limit) {
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
    logger.error("🔥 Erreur Quota Middleware", err);
    return res
      .status(500)
      .json({ success: false, error: "Erreur interne" });
  }
};