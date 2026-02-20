import { Request, Response, NextFunction } from "express";
import { SubscriptionService } from "../services/subscription.service";

export const subscriptionMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    await SubscriptionService.checkAccess(req.user.id);

    return next();
  } catch (error: any) {
    // Gestion explicite des erreurs métier
    if (error.code === "PLAN_REQUIRED") {
      return res.status(403).json({
        message: "Upgrade to PRO required",
      });
    }

    if (error.code === "SUBSCRIPTION_INACTIVE") {
      return res.status(403).json({
        message: "Subscription inactive",
      });
    }

    if (error.code === "QUOTA_EXCEEDED") {
      return res.status(403).json({
        message: "Quota exceeded",
      });
    }

    return next(error);
  }
};