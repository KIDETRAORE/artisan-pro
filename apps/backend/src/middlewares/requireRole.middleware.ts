import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@auth/permissions";
import { logger } from "@utils/logger";
import { sendError } from "@utils/apiError";

/**
 * requireRole
 * - Supporte 1 ou plusieurs rôles: requireRole("admin") / requireRole("admin", "user")
 * - Suppose que req.user est injecté par authMiddleware (Supabase JWT vérifié).
 */
export const requireRole = (...allowedRoles: readonly UserRole[]) => {
  const roles = allowedRoles;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(req, res, 401, "unauthorized", "Authentification requise");
    }

    const userRole = req.user.role;

    if (!roles.includes(userRole)) {
      logger.warn("Forbidden: role not allowed", {
        userId: req.user.id,
        userRole,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
      });

      return sendError(
        req,
        res,
        403,
        "forbidden",
        "Accès interdit (droits insuffisants)"
      );
    }

    return next();
  };
};