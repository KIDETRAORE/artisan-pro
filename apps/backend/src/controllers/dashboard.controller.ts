// src/controllers/dashboard.controller.ts

import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../config/env";
import { Plan } from "../types/plan";
import { quotaService } from "../services/quota.service";

/**
 * Client Supabase admin (SERVICE ROLE)
 * ⚠️ Uniquement côté backend
 */
const supabaseAdmin = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
);

export class DashboardController {
  /**
   * GET /dashboard
   * ➜ endpoint protégé (authMiddleware requis)
   */
  static async getDashboard(req: Request, res: Response) {
    try {
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
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
        console.error("Erreur récupération profil:", error);
        return res.status(500).json({
          message: "Erreur récupération profil",
        });
      }

      const plan: Plan = (profile?.plan as Plan) ?? "FREE";

      // ===============================
      // 🔥 Récupération quota
      // ===============================
      const quota = await quotaService.getUserQuota(user.id);

      const used = quota?.used ?? 0;
      const limit = quota?.monthly_limit ?? 0;
      const resetAt = quota?.reset_at ?? null;

      const percent =
        limit > 0 ? Math.round((used / limit) * 100) : 0;

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
          email: user.email,
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
    } catch (error) {
      console.error("Dashboard error:", error);
      return res.status(500).json({
        message: "Erreur lors du chargement du dashboard",
      });
    }
  }
}