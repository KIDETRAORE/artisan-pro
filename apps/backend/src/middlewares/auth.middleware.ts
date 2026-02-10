import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";

/**
 * Middleware d'authentification JWT
 * ➜ Vérifie l'accessToken
 * ➜ Injecte req.user
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header manquant" });
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authorization header invalide" });
  }

  try {
    const payload = verifyAccessToken(token);

    /**
     * Injection user dans la requête
     * ➜ utilisé par /auth/me, /dashboard, etc.
     */
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


