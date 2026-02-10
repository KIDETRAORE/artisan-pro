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
  // Erreurs métier contrôlées
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      message: err.message,
    });
  }

  // Erreurs JS natives
  if (err instanceof Error) {
    console.error("[Unhandled Error]", err.message, err.stack);
  } else {
    console.error("[Unknown Error]", err);
  }

  return res.status(500).json({
    message: "Erreur interne du serveur",
  });
}
