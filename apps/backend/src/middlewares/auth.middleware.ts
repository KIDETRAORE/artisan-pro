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

    const supabaseUser = data.user;

    // ======================
    // Mapping rôle sécurisé
    // ======================
    // Supabase retourne généralement "authenticated"
    // On mappe vers ton type interne strict
    const role: "user" | "admin" =
      supabaseUser.role === "admin" ? "admin" : "user";

    // ======================
    // Injection user sécurisé
    // ======================
    req.user = Object.freeze({
      id: supabaseUser.id,
      email: supabaseUser.email ?? "",
      role,
      permissions: [], // à enrichir plus tard si besoin
      tokenVersion: 1,  // prêt pour future invalidation token
    });

    return next();

  } catch (error) {
    console.error("Auth Middleware Error:", error);

    return res.status(401).json({
      message: "Authentication failed",
    });
  }
}
