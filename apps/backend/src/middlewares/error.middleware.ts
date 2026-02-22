import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

/**
 * Middleware global de gestion des erreurs - Corrigé pour TS strict
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const isDev = process.env.NODE_ENV !== "production";

  /* ================================
     ERREURS MÉTIER CONTRÔLÉES
  ================================== */
  if (err instanceof HttpError) {
    // On passe le message en premier pour satisfaire TS, 
    // et l'objet de données après
    logger.error(err.message, { status: err.statusCode });

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  /* ================================
     ERREURS JS NATIVES OU INCONNUES
  ================================== */
  if (err instanceof Error) {
    // On log le message et la stack séparément pour éviter l'erreur de type
    logger.error(err.message, { stack: err.stack });
  } else {
    logger.error("Unknown Error", { detail: err });
  }

  /* ================================
     ERREUR INTERNE
  ================================== */
  return res.status(500).json({
    success: false,
    message: isDev 
      ? (err instanceof Error ? err.message : "Internal server error")
      : "Erreur interne du serveur",
  });
}