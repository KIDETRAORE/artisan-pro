import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";

const FREE_LIMIT = 5;

export class SubscriptionService {
  /* ================================
     PLAN
  ================================== */

  static async getUserPlan(userId: string): Promise<"FREE" | "PRO"> {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("getUserPlan error:", error);
      throw new HttpError(500, "Failed to fetch user plan");
    }

    if (!data) {
      throw new HttpError(404, "User profile not found");
    }

    return data.plan as "FREE" | "PRO";
  }

  /* ================================
     MONTH KEY
  ================================== */

  static getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
  }

  /* ================================
     USAGE
  ================================== */

  static async getMonthlyUsage(userId: string): Promise<number> {
    const month = this.getCurrentMonthKey();

    const { data, error } = await supabaseAdmin
      .from("user_usage")
      .select("analyses_count")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle();

    if (error) {
      console.error("getMonthlyUsage error:", error);
      throw new HttpError(500, "Failed to fetch usage");
    }

    return data?.analyses_count ?? 0;
  }

  /* ================================
     INCREMENT (ATOMIC SAFE)
  ================================== */

  static async incrementUsage(userId: string): Promise<void> {
    const month = this.getCurrentMonthKey();

    const { error } = await supabaseAdmin.rpc(
      "increment_monthly_usage",
      {
        uid: userId,
        m: month,
      }
    );

    if (error) {
      console.error("incrementUsage rpc error:", error);
      throw new HttpError(500, "Failed to increment usage");
    }
  }

  /* ================================
     ACCESS CHECK
  ================================== */

  static async checkAccess(userId: string): Promise<void> {
    const plan = await this.getUserPlan(userId);

    // PRO → accès illimité
    if (plan === "PRO") return;

    // FREE → vérifier quota
    const usage = await this.getMonthlyUsage(userId);

    if (usage >= FREE_LIMIT) {
      throw new HttpError(
        403,
        "Free plan limit reached. Upgrade to PRO."
      );
    }
  }
}