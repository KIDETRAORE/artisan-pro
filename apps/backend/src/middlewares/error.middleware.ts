// apps/backend/src/middlewares/error.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

/**
 * Middleware global de gestion des erreurs (TS strict)
 * ✅ pas de stack exposée au client
 * ✅ pas de logs sensibles (pas de body/headers/cookies/tokens)
 * ✅ gère HttpError (métier) + ZodError (validation) + erreurs inconnues
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Optionnel si tu as un middleware qui met un id de corrélation (sinon undefined)
  const requestId =
    (req.headers["x-request-id"] as string | undefined) ??
    (req as any).requestId ??
    undefined;

  /* ================================
     1) ERREURS ZOD (VALIDATION)
  ================================== */
  if (err instanceof ZodError) {
    // Log minimal (pas de payload)
    logger.warn("Validation error", {
      requestId,
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    });

    return res.status(400).json({
      success: false,
      message: "Erreur de validation",
      errors: err.issues.map((e) => ({
        field: e.path.length ? e.path.join(".") : "body",
        message: e.message,
      })),
      requestId,
    });
  }

  /* ================================
     2) ERREURS MÉTIER CONTRÔLÉES
  ================================== */
  if (err instanceof HttpError) {
    // Log safe (ne pas inclure req.body, cookies, headers…)
    logger.error(err.message, {
      requestId,
      status: err.statusCode,
      code: (err as any).code, // si tu as un code interne optionnel
      path: req.path,
      method: req.method,
    });

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      requestId,
    });
  }

  /* ================================
     3) ERREURS INCONNUES / NATIVES
  ================================== */
  if (err instanceof Error) {
    // En prod, OK de log stack côté serveur (pas côté client)
    logger.error("Unhandled error", {
      requestId,
      name: err.name,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.error("Unhandled non-Error thrown", {
      requestId,
      detail: err,
      path: req.path,
      method: req.method,
    });
  }

  /* ================================
     4) RÉPONSE CLIENT (GENÉRIQUE)
  ================================== */
  return res.status(500).json({
    success: false,
    message: "Erreur interne du serveur",
    requestId,
  });
}