import { Request, Response, NextFunction } from "express";
import { quotaService } from "../services/quota.service";
import { HttpError } from "../utils/httpError";

/**
 * Middleware quota par fonctionnalité
 */
export function quotaMiddleware(feature: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user) {
        throw new HttpError(401, "Utilisateur non authentifié");
      }

      const result = await quotaService.checkAndLockQuota(
        user.id,
        feature
      );

      if (!result.allowed) {
        throw new HttpError(
          429,
          result.reason ?? "Quota dépassé"
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
