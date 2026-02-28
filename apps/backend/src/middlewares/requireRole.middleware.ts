import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@auth/permissions";
import { logger } from "@utils/logger";
import { sendError } from "@utils/apiError";

/**
 * requireRole
 * - Supporte un rôle unique ou une liste de rôles.
 * - Suppose que req.user est injecté par authMiddleware (Supabase JWT vérifié).
 */
export const requireRole = (allowedRole: UserRole | readonly UserRole[]) => {
  const roles = Array.isArray(allowedRole) ? allowedRole : [allowedRole];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(req, res, 401, "unauthorized", "Authentification requise");
    }

    const userRole = req.user.role;

    if (!roles.includes(userRole)) {
      logger.warn("[Security] Unauthorized role access attempt", {
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
        "Accès interdit (droits insuffisants)",
        { requiredRoles: roles, userRole }
      );
    }

    return next();
  };
};