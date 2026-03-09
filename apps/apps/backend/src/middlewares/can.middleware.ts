import { Request, Response, NextFunction } from "express";

export function can(requiredRole: "admin") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Non authentifié",
      });
    }

    if (req.user.role !== requiredRole) {
      return res.status(403).json({
        message: "Accès refusé",
        requiredRole,
      });
    }

    return next();
  };
}
