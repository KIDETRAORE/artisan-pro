// apps/backend/src/middlewares/quota.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { sendError } from "../utils/apiError";
// ✅ Harmonisation import quotaService (chemin unique)
import { quotaService } from "../services/quota.service";

function resolveFeature(req: Request): string {
  const base = String(req.baseUrl || "").toLowerCase();

  if (base.startsWith("/vision")) return "vision";
  if (base.startsWith("/compta")) return "compta";
  if (base.startsWith("/vocal")) return "vocal";
  if (base.startsWith("/assistant")) return "assistant";
  // ✅ Ne pas mapper /ai → "assistant"
  if (base.startsWith("/ai")) return "ai";
  if (base.startsWith("/devis")) return "devis";

  return "assistant";
}

export const quotaMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user?.id;
  if (!userId) {
    return sendError(req, res, 401, "unauthorized", "Utilisateur non authentifié");
  }

  const feature = resolveFeature(req);

  try {
    // ✅ Pré-check réel READ-ONLY via checkQuota
    const result = await quotaService.checkQuota(userId, feature);

    if (result.ok) {
      return next();
    }

    // Ligne quota inexistante
    if (result.code === "quota_row_missing") {
      return sendError(
        req,
        res,
        403,
        "quota_not_initialized",
        "Quota non initialisé. Ouvre le dashboard puis réessaie."
      );
    }

    // ✅ Quota dépassé → 403 + payload UI upgrade
    if (result.code === "quota_exceeded") {
      return sendError(req, res, 403, "quota_exceeded", "Quota atteint");
    }

    // Autre erreur métier
    logger.error("quotaMiddleware: checkQuota failed", {
      userId,
      feature,
      code: result.code,
    });

    return sendError(req, res, 500, "quota_check_failed", "Impossible de vérifier le quota");
  } catch (err: unknown) {
    logger.error("quotaMiddleware: unexpected error", {
      userId,
      feature,
      message: err instanceof Error ? err.message : String(err),
    });

    return sendError(req, res, 500, "quota_check_failed", "Impossible de vérifier le quota");
  }
};