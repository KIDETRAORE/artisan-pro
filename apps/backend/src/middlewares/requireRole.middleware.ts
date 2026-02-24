import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@auth/permissions";
import { logger } from "@utils/logger";

/**
 * requireRole
 * - Supporte un rôle unique ou une liste de rôles.
 * - Suppose que req.user est injecté par authMiddleware (Supabase JWT vérifié).
 */
export const requireRole = (allowedRole: UserRole | readonly UserRole[]) => {
  const roles = Array.isArray(allowedRole) ? allowedRole : [allowedRole];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentification requise",
      });
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

      return res.status(403).json({
        success: false,
        error: "Accès interdit (droits insuffisants)",
      });
    }

    return next();
  };
};