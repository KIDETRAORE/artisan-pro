import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { quotaService } from "../services/quota.service";

/**
 * SubscriptionService (P1)
 * ✅ Source de vérité plan/status : subscriptions
 * ✅ Source de vérité usage/quota : ai_quota
 *
 * ⚠️ Legacy:
 * - profiles.plan ❌
 * - user_usage ❌
 * - rpc increment_monthly_usage ❌
 *
 * Ce service est conservé pour compatibilité si d'autres fichiers l'importent encore,
 * mais la consommation réelle du quota doit être faite via quotaService.recordUsage().
 */
export class SubscriptionService {
  static async getUserPlan(userId: string): Promise<"FREE" | "PRO"> {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Failed to fetch subscription");
    }

    const plan = String(data?.plan ?? "free").toLowerCase();
    const status = String(data?.status ?? "inactive").toLowerCase();

    const isProActive = plan === "pro" && (status === "active" || status === "trialing");
    return isProActive ? "PRO" : "FREE";
  }

  /**
   * Renvoie l'usage courant depuis ai_quota.used
   */
  static async getMonthlyUsage(userId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from("ai_quota")
      .select("used")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Failed to fetch quota usage");
    }

    return Number(data?.used ?? 0);
  }

  /**
   * Legacy: incrementUsage n'est plus supporté en P1.
   * La consommation doit être faite via quotaService.recordUsage()
   * (qui consomme via RPC consume_ai_quota après succès IA).
   */
  static async incrementUsage(_userId: string): Promise<void> {
    throw new HttpError(
      410,
      "incrementUsage is deprecated. Use quotaService.recordUsage() after successful AI calls."
    );
  }

  /**
   * Check access générique (P1):
   * - PRO actif => OK
   * - FREE => pré-check quota via quotaService.checkQuota
   *
   * ⚠️ feature par défaut = "ai" (si tu as une clé globale),
   * sinon tu dois passer la feature ("vision", "vocal", "assistant"...)
   */
  static async checkAccess(userId: string, feature: string = "ai"): Promise<void> {
    const plan = await this.getUserPlan(userId);
    if (plan === "PRO") return;

    const q = await quotaService.checkQuota(userId, feature);
    if (!q.allowed) {
      throw new HttpError(403, q.reason || "Quota insuffisant. Upgrade to PRO.");
    }
  }
}