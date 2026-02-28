import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { isPro, normalizePlan } from "../domain/plan"; // ✅ A/B/C (ajout normalizePlan)

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

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) {
      logger.error("❌ subscriptions lookup error", { userId, subErr });
      return res.status(500).json({ success: false, error: "Erreur interne" });
    }

    // ✅ C: plan normalisé via helper unique
    const plan = normalizePlan(sub?.plan);
    const status = String(sub?.status ?? "inactive").toLowerCase();

    // ✅ B (déjà OK): comparaison via isPro
    const isProActive =
      isPro(plan) && (status === "active" || status === "trialing");

    if (isProActive) {
      return next();
    }

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

    const now = new Date();
    const resetAt = quota.reset_at ? new Date(quota.reset_at) : null;

    if (resetAt && now > resetAt) {
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

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

      used = 0;
    }

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
    return res.status(500).json({ success: false, error: "Erreur interne" });
  }
};