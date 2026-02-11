import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";

/**
 * Middleware d'authentification JWT
 * ➜ Vérifie l'accessToken (header OU cookie)
 * ➜ Injecte req.user
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  let token: string | undefined;

  /**
   * ======================
   * DEBUG AUTH
   * ======================
   */
  console.log("AUTH DEBUG", {
    cookies: req.cookies,
    authHeader: req.headers.authorization,
  });

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
   * 2️⃣ Cookie fallback (web)
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

    (req as any).user = {
      id: payload.id,
      email: payload.email,
      tokenVersion: payload.tokenVersion,
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      message: "Access token invalide ou expiré",
    });
  }
}
