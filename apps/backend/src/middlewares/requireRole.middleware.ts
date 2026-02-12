import { Request, Response, NextFunction } from "express";
import type { UserRole } from "../auth/permissions";

/**
 * Middleware de contrôle des rôles
 * @param role rôle requis (ex: "admin")
 */
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Non authentifié",
      });
    }

    if (req.user.role !== role) {
      return res.status(403).json({
        message: "Accès interdit (droits insuffisants)",
      });
    }

    next();
  };
}
