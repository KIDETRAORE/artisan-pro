import { Request, Response, NextFunction } from "express";
import { type Permission } from "@auth/permissions";

export const requirePermission =
  (permission: Permission) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Non authentifié",
      });
    }

    // ✅ permissions peut être undefined (user Supabase), on sécurise
    const permissions = Array.isArray((req.user as any).permissions)
      ? ((req.user as any).permissions as Permission[])
      : [];

    if (!permissions.includes(permission)) {
      return res.status(403).json({
        message: "Permission insuffisante",
      });
    }

    next();
  };