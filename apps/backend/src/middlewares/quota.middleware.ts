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
    // ✅ READ-ONLY: SELECT uniquement (pas de ensureQuotaRow, pas d'UPDATE)
    const q = await quotaService.getUserQuota(userId);

    // Si pas de ligne quota : forcer un passage par /dashboard (init)
    if (!q) {
      return sendError(
        req,
        res,
        403,
        "quota_not_initialized",
        "Quota non initialisé. Ouvre le dashboard puis réessaie.",
        { feature }
      );
    }

    // ✅ Reset logique uniquement (sans UPDATE)
    if (q.reset_at && new Date(q.reset_at).getTime() <= Date.now()) {
      // IMPORTANT: pas d'update ici (read-only)
      // Le dashboard fera l'init/refresh si nécessaire.
    }

    return next();
  } catch (err: unknown) {
    logger.error("quotaMiddleware: unexpected error", {
      userId,
      feature,
      message: err instanceof Error ? err.message : String(err),
    });

    return sendError(
      req,
      res,
      500,
      "quota_check_failed",
      "Impossible de vérifier le quota",
      { feature }
    );
  }
};