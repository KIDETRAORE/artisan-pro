// apps/backend/src/controllers/dashboard.controller.ts
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../config/env";
import type { Plan } from "../types/plan";
import { quotaService } from "../services/quota.service";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

/**
 * Client Supabase admin (SERVICE ROLE)
 * ⚠️ Uniquement côté backend
 */
const supabaseAdmin = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

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
    // 🔎 Lecture du profil
    // ===============================
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (error) {
      // ✅ log minimal (pas d'objet complet)
      logger.error("Dashboard: erreur récupération profil", {
        userId: user.id,
        message: error.message,
      });
      // ✅ message client safe
      throw new HttpError(500, "Erreur lors du chargement du dashboard");
    }

    const plan: Plan = (profile?.plan as Plan) ?? "FREE";

    // ===============================
    // 🔥 Récupération quota
    // ===============================
    const quota = await quotaService.getUserQuota(user.id);

    const used = quota?.used ?? 0;
    const limit = quota?.monthly_limit ?? 0;
    const resetAt = quota?.reset_at ?? null;

    const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

    // ===============================
    // 🔥 Features dynamiques
    // ===============================
    const features = {
      generate: true,
      analyze: plan === "PRO",
      history: plan === "PRO",
    };

    return res.status(200).json({
      message: "Dashboard accessible",
      user: {
        id: user.id,
        email: user.email ?? null,
        plan,
      },
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