import { Request, Response, NextFunction } from "express";
import { requireUser } from "@utils/requireUser";
import { SubscriptionService } from "@services/subscription.service";

/**
 * Middleware de vérification d'abonnement
 * Exemple : requirePlan("PRO")
 */
export function requirePlan(requiredPlan: "FREE" | "PRO") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);

      const userPlan = await SubscriptionService.getUserPlan(user.id);

      // Si la route nécessite PRO
      if (requiredPlan === "PRO" && userPlan !== "PRO") {
        return res.status(403).json({
          message: "Upgrade required to access this feature",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
