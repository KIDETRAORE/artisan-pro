import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

/**
 * Middleware global de gestion des erreurs
 * ➜ capture toutes les erreurs non gérées
 * ➜ normalise la réponse API
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
    if (isDev) {
      console.error("[HttpError]", {
        status: err.statusCode,
        message: err.message,
        stack: err.stack,
      });
    }

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  /* ================================
     ERREURS JS NATIVES
  ================================== */
  if (err instanceof Error) {
    console.error("[Unhandled Error]", err.message, err.stack);
  } else {
    console.error("[Unknown Error]", err);
  }

  /* ================================
     ERREUR INTERNE
  ================================== */
  return res.status(500).json({
    success: false,
    message: isDev
      ? "Internal server error"
      : "Erreur interne du serveur",
  });
}