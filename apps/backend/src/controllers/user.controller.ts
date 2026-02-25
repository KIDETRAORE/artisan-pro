// apps/backend/src/controllers/user.controller.ts
import type { Request, Response } from "express";
import { requireUser } from "../utils/requireUser";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { quotaService } from "../services/quota.service";

export const getUserInfo = async (req: Request, res: Response) => {
  const user = requireUser(req);

  // ✅ Source de vérité: subscriptions
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("plan,status,current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  const planRaw = String(sub?.plan ?? "free").toLowerCase();
  const statusRaw = String(sub?.status ?? "inactive").toLowerCase();

  const plan = planRaw === "pro" ? "PRO" : "FREE";
  const isProActive = plan === "PRO" && (statusRaw === "active" || statusRaw === "trialing");

  // ✅ Source de vérité quota: ai_quota
  const quota = await quotaService.getUserQuota(user.id);
  const used = quota?.used ?? 0;
  const limit = quota?.monthly_limit ?? 0;
  const resetAt = quota?.reset_at ?? null;

  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email ?? null,
      role: (user as any).role ?? null,
    },
    subscription: {
      plan,
      status: statusRaw,
      currentPeriodEnd: sub?.current_period_end ?? null,
      proActive: isProActive,
    },
    quota: {
      used,
      limit,
      remaining: limit > 0 ? Math.max(0, limit - used) : null,
      resetAt,
    },
  });
};