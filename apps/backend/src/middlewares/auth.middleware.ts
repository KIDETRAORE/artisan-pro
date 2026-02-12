import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";

/**
 * Middleware d'authentification JWT
 * ➜ Vérifie l’accessToken
 * ➜ Injecte req.user (données IMMUTABLES issues du JWT)
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  let token: string | undefined;

  /**
   * ======================
   * 1️⃣ Authorization header
   * ======================
   */
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [type, value] = authHeader.split(" ");
    if (type === "Bearer" && value) {
      token = value;
    }
  }

  /**
   * ======================
   * 2️⃣ Cookie fallback
   * ======================
   */
  if (!token) {
    token = req.cookies?.accessToken;
  }

  /**
   * ======================
   * Token manquant
   * ======================
   */
  if (!token) {
    return res.status(401).json({
      message: "Non authentifié (token manquant)",
    });
  }

  /**
   * ======================
   * Vérification JWT
   * ======================
   */
  try {
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tokenVersion: payload.tokenVersion,
      permissions: payload.permissions, // ✅ readonly → readonly
    };

    return next();
  } catch {
    return res.status(401).json({
      message: "Access token invalide ou expiré",
    });
  }
}

