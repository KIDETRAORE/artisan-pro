import { Request, Response, NextFunction } from "express";
import { ENV } from "../config/env";

export function quotaMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  // 🔓 QUOTA DÉSACTIVÉ (OPTION A)
  if (!ENV.QUOTA_ENABLED) {
    return next();
  }

  // 🔒 FUTURE LOGIQUE (PHASE 2)
  // ⚠️ volontairement vide pour l’instant
  return next();
}
