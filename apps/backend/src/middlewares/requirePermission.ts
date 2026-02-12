import { Request, Response, NextFunction } from "express";
import { Permission } from "../auth/permissions";

/**
 * Middleware de vérification de permission
 */
export const requirePermission =
  (permission: Permission) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.permissions.includes(permission)) {
      return res.status(403).json({
        message: "Accès interdit (permission requise)",
      });
    }

    next();
  };
