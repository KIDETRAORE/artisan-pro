import { jwtVerify, createRemoteJWKSet, JWTPayload } from "jose";
import { Request, Response, NextFunction } from "express";
import { ENV } from "../config/env.js";

// 🔐 JWKS Supabase
const JWKS = createRemoteJWKSet(
  new URL(`${ENV.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

interface SupabaseJwtPayload extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
}

export async function verifySupabaseToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Token manquant",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${ENV.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });

    const jwtPayload = payload as SupabaseJwtPayload;

    if (!jwtPayload.sub) {
      return res.status(401).json({
        message: "Token invalide",
      });
    }

    if (jwtPayload.role !== "authenticated") {
      return res.status(403).json({
        message: "Accès refusé",
      });
    }

    // ✅ Conforme à ton types/express/index.d.ts
    req.user = Object.freeze({
      id: jwtPayload.sub,
      email: jwtPayload.email ?? "",
      role: "authenticated",
      permissions: [], // 🔥 obligatoire pour matcher ton type global
      stripePlan: null
    });

    return next();
  } catch (error) {
    console.error("JWT VERIFY ERROR:", error);
    return res.status(401).json({
      message: "Token invalide ou expiré",
    });
  }
}
