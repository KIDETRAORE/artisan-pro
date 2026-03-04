// apps/backend/src/controllers/dashboard.controller.ts
import type { Request, Response } from "express";
import type { Plan } from "../domain/plan";
import { normalizePlan, isPro } from "../domain/plan";
import { quotaService } from "../services/quota.service";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";

type AuthedRequest = Request & {
  user?: { id: string; email?: string };
};

// ✅ AJOUT UNIQUE: type snapshot (optionnel, n'impacte pas l'existant)
type CopilotSnapshot = {
  title: string;
  alerts: Array<{ severity: "critical" | "warn" | "info"; label: string }>;
  actions: string[];
  toCheck: string;
  nextStep: string;
  questions: string[];
  figures: {
    tvaAPayer: number;
    tvaCollectee: number;
    tvaDeductible: number;
    recettesHT: number;
    depensesHT: number;
    resultatNet: number;
  };
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

    const planNorm = normalizePlan(sub?.plan);
    const statusRaw = String(sub?.status ?? "inactive").toLowerCase();

    const plan: Plan = planNorm === "pro" ? "PRO" : "FREE";

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

    const percent =
      limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    // ===============================
    // Features (si tu veux les baser sur plan+status)
    // ===============================
    const isProActive =
      isPro(plan) && (statusRaw === "active" || statusRaw === "trialing");

    const features = {
      generate: true,
      analyze: isProActive,
      history: isProActive,
    };

    // ===============================
    // ✅ AJOUT UNIQUE: dernier snapshot copilote (best effort)
    // - Ne casse pas l'existant : champs optionnels
    // ===============================
    let copilotSnapshot: CopilotSnapshot | null = null;
    let copilotAnalysisId: string | null = null;

    try {
      const { data: lastCompta, error: lastErr } = await supabaseAdmin
        .from("ai_logs")
        .select("id, response_json")
        .eq("user_id", user.id)
        .eq("feature", "compta")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastErr && lastCompta?.response_json) {
        const rj: any = lastCompta.response_json as any;
        const maybe = rj?.copilot ?? rj?.snapshot ?? rj?.copilotSnapshot ?? null;

        if (maybe && typeof maybe === "object") {
          copilotSnapshot = maybe as CopilotSnapshot;
          copilotAnalysisId = String(lastCompta.id);
        }
      }
    } catch {
      copilotSnapshot = null;
      copilotAnalysisId = null;
    }

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

      // ✅ AJOUT UNIQUE: optionnel, compat backward
      copilotSnapshot,
      copilotAnalysisId,
    });
  }
}