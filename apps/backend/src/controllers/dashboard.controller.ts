// apps/backend/src/controllers/dashboard.controller.ts
import type { Request, Response } from "express";
import type { Plan } from "../types/plan";
import { quotaService } from "../services/quota.service";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";

type AuthedRequest = Request & {
  user?: { id: string; email?: string };
};

export class DashboardController {
  /**
   * GET /dashboard
   * ➜ endpoint protégé (authMiddleware requis)
   */
  static async getDashboard(req: Request, res: Response) {
    const r = req as AuthedRequest;
    const user = r.user;

    if (!user?.id) {
      throw new HttpError(401, "Unauthorized");
    }

    // ===============================
    // ✅ Source de vérité PLAN/STATUS : subscriptions
    // ===============================
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status,current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr) {
      logger.error("Dashboard: erreur récupération subscription", {
        userId: user.id,
        message: subErr.message,
      });
      throw new HttpError(500, "Erreur lors du chargement du dashboard");
    }

    const planRaw = String(sub?.plan ?? "free").toLowerCase();
    const statusRaw = String(sub?.status ?? "inactive").toLowerCase();

    // Normalisation vers ton type Plan ("FREE" | "PRO")
    const plan: Plan = planRaw === "pro" ? "PRO" : "FREE";

    // (Optionnel) Tu peux exposer status au front si utile
    const subscription = {
      plan,
      status: statusRaw,
      currentPeriodEnd: sub?.current_period_end ?? null,
    };

    // ===============================
    // ✅ Source de vérité QUOTA : ai_quota
    // ===============================
    const quota = await quotaService.getUserQuota(user.id);

    const used = quota?.used ?? 0;
    const limit = quota?.monthly_limit ?? 0;
    const resetAt = quota?.reset_at ?? null;

    const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    // ===============================
    // Features (si tu veux les baser sur plan+status)
    // ===============================
    const isProActive =
      plan === "PRO" && (statusRaw === "active" || statusRaw === "trialing");

    const features = {
      generate: true,
      analyze: isProActive,
      history: isProActive,
    };

    return res.status(200).json({
      message: "Dashboard accessible",
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      subscription,
      features,
      quota: {
        used,
        limit,
        percent,
        resetAt,
      },
    });
  }
}