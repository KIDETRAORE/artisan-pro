import { Request, Response, NextFunction } from "express";
import { logger } from "@utils/logger";

/**
 * Middleware de logging des requêtes HTTP
 */
export function httpLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const start = Date.now();

  // Quand la réponse est terminée
  res.on("finish", () => {
    const duration = Date.now() - start;

    logger.info("HTTP Request", {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userId: req.user?.id ?? null,
    });
  });

  next();
}
