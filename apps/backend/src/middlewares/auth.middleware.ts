import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { db } from "../config/db";
import { getPermissionsByRole, normalizeRole } from "@auth/permissions";
import { HttpError } from "../utils/httpError";

type CachedProfile = {
  role: string | null;
  plan: string | null;
  expiresAt: number;
};

// Cache mémoire (OK en dev / single instance). En prod multi-instance => Redis cache si besoin.
const profileCache = new Map<string, CachedProfile>();
const PROFILE_CACHE_TTL_MS = 30_000;

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("🔐 Tentative d'accès sans token");
      res.status(401).json({ success: false, message: "Token manquant" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();

    // 1) Validation token Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      logger.warn("🔐 Token invalide ou session expirée");
      res.status(401).json({ success: false, message: "Session expirée" });
      return;
    }

    const userId = data.user.id;

    // 2) Cache profil (évite DB spam sur polling)
    const cached = profileCache.get(userId);
    let roleRaw: unknown;
    let planRaw: unknown;

    if (cached && cached.expiresAt > Date.now()) {
      roleRaw = cached.role;
      planRaw = cached.plan;
    } else {
      const result = await db.query(
        "SELECT role, plan FROM profiles WHERE id = $1",
        [userId]
      );

      const profile = result.rows?.[0];
      if (!profile) {
        logger.warn("Profil introuvable en base", { userId });
        res.status(401).json({ success: false, message: "Profil introuvable" });
        return;
      }

      roleRaw = profile.role;
      planRaw = profile.plan;

      profileCache.set(userId, {
        role: (roleRaw ?? null) as string | null,
        plan: (planRaw ?? null) as string | null,
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
      });
    }

    const role = normalizeRole(roleRaw);
    const plan = String(planRaw ?? "FREE");

    (req as any).user = {
      id: userId,
      email: data.user.email,
      role,
      plan,
      permissions: getPermissionsByRole(role),
    };

    next();
  } catch (err: unknown) {
    logger.error("🔥 Erreur Auth Middleware", {
      message: err instanceof Error ? err.message : String(err),
    });

    const message =
      err instanceof HttpError ? err.message : "Erreur d'authentification";

    res.status(401).json({ success: false, message });
  }
};