import { ENV } from "../config/env";

/**
 * ================================
 * CONFIGURATION DES COOKIES AUTH
 * ================================
 * Centralise les options pour éviter les bugs
 * entre login / refresh / logout
 */

export const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

/**
 * Options par défaut pour le cookie refresh token
 */
export const refreshTokenCookieOptions = {
  httpOnly: true,                        // 🔐 inaccessible au JS
  secure: ENV.NODE_ENV === "production", // HTTPS uniquement en prod
  sameSite: "lax" as const,              // refresh cross-origin léger
  path: "/",                             // ⚠️ TRÈS IMPORTANT
};

/**
 * Options pour SUPPRIMER le cookie
 */
export const clearRefreshTokenCookieOptions = {
  ...refreshTokenCookieOptions,
  maxAge: 0,
};
