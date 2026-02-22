import rateLimit from "express-rate-limit";
// On garde HttpError si tu veux rester cohérent avec ton utils actuel
import { HttpError } from "../utils/httpError"; 

// 1. Limite Globale (300 requêtes / 15 min) - Protection Serveur
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Trop de requêtes globales, réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Limite IA (20 requêtes / minute) - Protection Budget / Token
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Limite d'utilisation de l'IA atteinte pour cette minute." },
  standardHeaders: true,
  legacyHeaders: false,
  // Optionnel : On peut personnaliser l'erreur pour utiliser ton HttpError
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  }
});