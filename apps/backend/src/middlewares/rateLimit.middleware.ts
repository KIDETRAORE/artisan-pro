import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { sendError } from "../utils/apiError";

/**
 * ===============================
 * Helpers
 * ===============================
 */

/**
 * Exclusion explicite de certaines routes sensibles
 * - Stripe webhook : ne JAMAIS rate-limit (Stripe retry sinon)
 */
const shouldSkipRateLimit = (req: Request): boolean => {
  return req.path.startsWith("/stripe/webhook");
};

/**
 * ===============================
 * 1️⃣ Limite Globale
 * ===============================
 * Protection serveur (DDoS léger, abus API)
 * 300 requêtes / 15 min / IP
 */
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,

  standardHeaders: true,
  legacyHeaders: false,

  skip: shouldSkipRateLimit,

  handler: (req: Request, res: Response) => {
    return sendError(
      req,
      res,
      429,
      "rate_limited_global",
      "Trop de requêtes globales, réessayez plus tard."
    );
  },
});

/**
 * ===============================
 * 2️⃣ Limite IA
 * ===============================
 * Protection budget / tokens
 * 20 requêtes / minute / IP
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,

  standardHeaders: true,
  legacyHeaders: false,

  skip: shouldSkipRateLimit,

  handler: (req: Request, res: Response) => {
    return sendError(
      req,
      res,
      429,
      "rate_limited_ai",
      "Limite d'utilisation de l'IA atteinte pour cette minute."
    );
  },
});