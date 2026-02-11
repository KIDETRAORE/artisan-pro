import { Request, Response, NextFunction } from "express";
import { UserRole } from "../services/auth.service";

/**
 * Middleware de permission par rôle
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
        message: "Accès refusé",
      });
    }

    next();
  };
}
