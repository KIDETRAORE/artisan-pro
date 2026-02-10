import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { ENV } from "../config/env";

/**
 * Génère une clé unique de rate limit
 * → userId si connecté
 * → sinon IP
 */
function keyGenerator(req: Request): string {
  // Si l'utilisateur est authentifié
  const user = (req as any).user;
  if (user?.id) {
    return `user:${user.id}`;
  }

  // Fallback IP (compatible proxy / docker)
  return req.ip || "unknown-ip";
}

/**
 * Middleware global de rate limiting
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS, // ex: 1 min
  max: ENV.RATE_LIMIT_MAX,            // ex: 100 req / window
  standardHeaders: true,              // RateLimit-* headers
  legacyHeaders: false,

  keyGenerator,

  handler: (_req, res) => {
    res.status(429).json({
      error: "TOO_MANY_REQUESTS",
      message: "Trop de requêtes. Merci de réessayer plus tard."
    });
  }
});
