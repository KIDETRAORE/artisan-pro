import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

/**
 * Fenêtre de limitation (1 minute)
 */
const WINDOW_MS = 60_000;

/**
 * Nombre max de requêtes par fenêtre
 */
const MAX_REQUESTS = 30;

type RateLimitEntry = {
  count: number;
  lastReset: number;
};

/**
 * Store en mémoire (OK pour dev / MVP)
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const key =
      req.ip ||
      req.headers["x-forwarded-for"]?.toString() ||
      "unknown";

    const now = Date.now();
    const entry = rateLimitStore.get(key);

    // Première requête
    if (!entry) {
      rateLimitStore.set(key, {
        count: 1,
        lastReset: now,
      });
      next();
      return;
    }

    // Fenêtre expirée → reset
    if (now - entry.lastReset > WINDOW_MS) {
      entry.count = 1;
      entry.lastReset = now;
      next();
      return;
    }

    // Incrément
    entry.count += 1;

    // Limite dépassée
    if (entry.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil(
        (entry.lastReset + WINDOW_MS - now) / 1000
      );

      res.setHeader("Retry-After", retryAfter.toString());

      res.status(429).json({
        error: "Trop de requêtes, veuillez réessayer plus tard",
        retryAfter,
      });
      return;
    }

    next();
  } catch (error) {
    next(new HttpError(500, "Rate limit middleware error"));
  }
}
