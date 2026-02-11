import { Request, Response, NextFunction } from "express";
import { Permission } from "../auth/permissions";

export function can(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Non authentifié",
      });
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({
        message: "Permission refusée",
        permission,
      });
    }

    return next();
  };
}
