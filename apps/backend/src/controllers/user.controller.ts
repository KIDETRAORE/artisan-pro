import type { Request, Response } from "express";
import { SubscriptionService } from "@services/subscription.service";
import { requireUser } from "@utils/requireUser";

/**
 * GET /user/me
 */
export const getUserInfo = async (req: Request, res: Response) => {
  const user = requireUser(req);

  const plan = await SubscriptionService.getUserPlan(user.id);
  const usage = await SubscriptionService.getMonthlyUsage(user.id);

  return res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    plan,
    usage,
    remaining: plan === "PRO" ? null : Math.max(0, 5 - usage),
  });
};