import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { normalizePlan, isPro as isProPlan } from "../domain/plan";

/**
 * SubscriptionService
 * ✅ Wrapper de lecture unique sur la table subscriptions
 * ✅ Ne dépend PAS de profiles
 * ✅ Ne gère PAS le quota (ai_quota est géré ailleurs)
 */
export class SubscriptionService {
  static async getUserSubscription(userId: string): Promise<{
    plan: "free" | "pro";
    status: string;
    currentPeriodEnd: string | null;
  }> {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status,current_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Failed to fetch subscription");
    }

    const plan = normalizePlan(data?.plan); // "free" | "pro"
    const status = String(data?.status ?? "inactive").toLowerCase();

    const currentPeriodEndRaw = (data as any)?.current_period_end ?? null;
    const currentPeriodEnd =
      typeof currentPeriodEndRaw === "string" ? currentPeriodEndRaw : null;

    return { plan, status, currentPeriodEnd };
  }

  static async isPro(userId: string): Promise<boolean> {
    const sub = await this.getUserSubscription(userId);
    return (
      isProPlan(sub.plan) &&
      (sub.status === "active" || sub.status === "trialing")
    );
  }

  static async requirePro(userId: string): Promise<void> {
    const ok = await this.isPro(userId);
    if (!ok) {
      throw new HttpError(403, "Plan PRO requis");
    }
  }
}