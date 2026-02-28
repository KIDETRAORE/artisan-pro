// apps/backend/src/middlewares/quota.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { sendError } from "../utils/apiError";
import { quotaService } from "../services/quota.service";

function resolveFeature(req: Request): string {
  const base = String(req.baseUrl || "").toLowerCase();

  if (base.startsWith("/vision")) return "vision";
  if (base.startsWith("/compta")) return "compta";
  if (base.startsWith("/vocal")) return "vocal";
  if (base.startsWith("/assistant")) return "assistant";
  if (base.startsWith("/ai")) return "assistant";
  if (base.startsWith("/devis")) return "devis";

  return "assistant";
}

export const quotaMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) {
    return sendError(req, res, 401, "unauthorized", "Utilisateur non authentifié");
  }

  const feature = resolveFeature(req);

  try {
    const q = await quotaService.checkQuota(userId, feature);

    if (!q?.ok) {
      const code = (q as any)?.code ?? "quota_exceeded";

      if (code === "quota_row_missing") {
        return sendError(req, res, 403, "quota_row_missing", "Quota introuvable. Ouvre le dashboard puis réessaie.", {
          feature,
        });
      }

      if (code === "quota_exceeded") {
        return sendError(req, res, 403, "quota_exceeded", "Quota insuffisant. Passez au plan PRO.", {
          feature,
          used: (q as any)?.used,
          limit: (q as any)?.limit,
          requiredUnits: (q as any)?.weight,
          resetAt: (q as any)?.resetAt ?? null,
        });
      }

      return sendError(req, res, 500, "quota_check_failed", "Erreur lors de la vérification quota", {
        feature,
        reason: (q as any)?.reason,
      });
    }

    return next();
  } catch (err: unknown) {
    logger.error("quotaMiddleware: unexpected error", {
      userId,
      feature,
      message: err instanceof Error ? err.message : String(err),
    });

    return sendError(req, res, 500, "quota_check_failed", "Erreur lors de la vérification quota", {
      feature,
    });
  }
};