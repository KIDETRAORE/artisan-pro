import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../config/env";

/**
 * Client Supabase backend
 * Utilise la SERVICE ROLE KEY (sécurisé côté serveur uniquement)
 */
const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
);

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    // ======================
    // Vérification header
    // ======================
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Non authentifié (token manquant)",
      });
    }

    const token = authHeader.split(" ")[1];

    // ======================
    // Vérification JWT Supabase
    // ======================
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        message: "Token invalide ou expiré",
      });
    }

    // ======================
    // Injection user sécurisé
    // ======================
    (req as any).user = Object.freeze({
      id: data.user.id,
      email: data.user.email,
      role: data.user.role ?? "authenticated",
    });

    return next();

  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(401).json({
      message: "Authentication failed",
    });
  }
}
