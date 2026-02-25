import rateLimit from "express-rate-limit";
import type { Request } from "express";

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
 * Skip IA rate-limit for "cheap" endpoints:
 * - /ai/status/:jobId (polling)
 * - /ai/export/:jobId (download result)
 *
 * Keep rate-limit for the expensive endpoint:
 * - /ai/run
 */
const shouldSkipAiRateLimit = (req: Request): boolean => {
  if (shouldSkipRateLimit(req)) return true;

  // NOTE: req.path is path-only (no query string)
  // if your ai routes are mounted under "/ai", req.path will be "/run", "/status/:jobId", ...
  const p = req.path;

  // skip polling + export to avoid 429 spam
  if (p.startsWith("/status")) return true;
  if (p.startsWith("/export")) return true;

  return false;
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

  message: {
    success: false,
    error: "Trop de requêtes globales, réessayez plus tard.",
  },
});

/**
 * ===============================
 * 2️⃣ Limite IA
 * ===============================
 * Protection budget / tokens
 * ⚠️ On ne limite PAS le polling /status (sinon 429)
 * On limite uniquement les appels coûteux (/run)
 *
 * 20 requêtes / minute / IP
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,

  standardHeaders: true,
  legacyHeaders: false,

  // ✅ Skip /status + /export (+ stripe webhook)
  skip: shouldSkipAiRateLimit,

  handler: (_req, res) => {
    return res.status(429).json({
      success: false,
      error: "Limite d'utilisation de l'IA atteinte pour cette minute.",
    });
  },
});