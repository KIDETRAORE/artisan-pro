import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";

const FREE_LIMIT = 5;

export class SubscriptionService {
  /* ================================
     PLAN
  ================================== */

  static async getUserPlan(userId: string): Promise<"FREE" | "PRO"> {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("plan")
      .eq("id", userId)
      .single();

    if (error || !data) {
      throw new HttpError(404, "User not found");
    }

    return data.plan as "FREE" | "PRO";
  }

  /* ================================
     MONTH KEY
  ================================== */

  static getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  /* ================================
     USAGE
  ================================== */

  static async getMonthlyUsage(userId: string): Promise<number> {
    const month = this.getCurrentMonthKey();

    const { data } = await supabaseAdmin
      .from("user_usage")
      .select("analyses_count")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle();

    return data?.analyses_count ?? 0;
  }

  /* ================================
     INCREMENT (safe version)
  ================================== */

  static async incrementUsage(userId: string): Promise<void> {
    const month = this.getCurrentMonthKey();

    // Upsert atomique (évite race condition)
    const { error } = await supabaseAdmin
      .from("user_usage")
      .upsert(
        {
          user_id: userId,
          month,
          analyses_count: 1,
        },
        {
          onConflict: "user_id,month",
          ignoreDuplicates: false,
        }
      );

    if (error) {
      throw new HttpError(500, "Failed to increment usage");
    }

    // Si déjà existant → on incrémente proprement
    await supabaseAdmin.rpc("increment_usage", {
      p_user_id: userId,
      p_month: month,
    });
  }

  /* ================================
     ACCESS CHECK
  ================================== */

  static async checkAccess(userId: string): Promise<void> {
    const plan = await this.getUserPlan(userId);

    if (plan === "PRO") return;

    const usage = await this.getMonthlyUsage(userId);

    if (usage >= FREE_LIMIT) {
      throw new HttpError(
        403,
        "Free plan limit reached. Upgrade to PRO."
      );
    }
  }
}
