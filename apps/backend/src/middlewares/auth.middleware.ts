// apps/backend/src/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import type { Permission, UserRole } from "../auth/permissions";
import { PERMISSIONS } from "../auth/permissions";
import { sendError } from "../utils/apiError";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // 1) Vérification header Authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("🔐 Tentative d'accès sans token");
      sendError(
        req,
        res,
        401,
        "auth_missing_token",
        "Non authentifié : Token manquant"
      );
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    // 2) Validation du token auprès de Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      logger.warn(
        `🔐 Token invalide ou expiré : ${error?.message || "User non trouvé"}`
      );
      sendError(
        req,
        res,
        401,
        "auth_invalid_token",
        "Session invalide ou expirée"
      );
      return;
    }

    const userId = data.user.id;

    // 3) Permissions depuis app_metadata (filtrées sur Permission union)
    const rawPermissions = Array.isArray(
      (data.user as any)?.app_metadata?.permissions
    )
      ? ((data.user as any).app_metadata.permissions as unknown[])
      : [];

    const allowed = new Set<string>(Object.values(PERMISSIONS));
    const permissions: Permission[] = rawPermissions
      .map((p) => String(p))
      .filter((p): p is Permission => allowed.has(p));

    // 4) Récupération du role depuis profiles (source de vérité)
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role,full_name")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) {
      logger.error("🔥 Erreur lookup profile dans authMiddleware", {
        userId,
        message: profErr.message,
      });
      sendError(req, res, 401, "auth_error", "Erreur d'authentification");
      return;
    }

    // Fallbacks sûrs
    const role = (profile?.role ? String(profile.role) : "user") as UserRole;

    // ✅ MODIF UNIQUE: fallback permissions par rôle (inclut factures + lignes + projects)
    const DEFAULT_PERMS_BY_ROLE: Record<UserRole, Permission[]> = {
      user: [
        PERMISSIONS.ACCESS_DASHBOARD,
        PERMISSIONS.AI_USE,
        PERMISSIONS.USE_VISION,
        PERMISSIONS.DEVIS_READ,
        PERMISSIONS.INVOICES_READ,
        PERMISSIONS.INVOICES_WRITE,
        PERMISSIONS.CLIENTS_READ,
        PERMISSIONS.CLIENTS_WRITE,
        PERMISSIONS.INVOICE_LINES_READ,
        PERMISSIONS.INVOICE_LINES_WRITE,
        PERMISSIONS.PROJECTS_READ,
        PERMISSIONS.PROJECTS_WRITE,
      ] as Permission[],
      admin: Object.values(PERMISSIONS) as Permission[],
      free: [
        PERMISSIONS.ACCESS_DASHBOARD,
        PERMISSIONS.AI_USE,
        PERMISSIONS.USE_VISION,
        PERMISSIONS.DEVIS_READ,
        PERMISSIONS.INVOICES_READ,
        PERMISSIONS.INVOICES_WRITE,
        PERMISSIONS.CLIENTS_READ,
        PERMISSIONS.CLIENTS_WRITE,
        PERMISSIONS.INVOICE_LINES_READ,
        PERMISSIONS.INVOICE_LINES_WRITE,
        PERMISSIONS.PROJECTS_READ,
        PERMISSIONS.PROJECTS_WRITE,
      ] as Permission[],
      pro: [
        PERMISSIONS.ACCESS_DASHBOARD,
        PERMISSIONS.AI_USE,
        PERMISSIONS.USE_VISION,
        PERMISSIONS.DEVIS_READ,
        PERMISSIONS.INVOICES_READ,
        PERMISSIONS.INVOICES_WRITE,
        PERMISSIONS.CLIENTS_READ,
        PERMISSIONS.CLIENTS_WRITE,
        PERMISSIONS.INVOICE_LINES_READ,
        PERMISSIONS.INVOICE_LINES_WRITE,
        PERMISSIONS.PROJECTS_READ,
        PERMISSIONS.PROJECTS_WRITE,
      ] as Permission[],
    };

    const effectivePermissions =
      permissions.length > 0 ? permissions : DEFAULT_PERMS_BY_ROLE[role] ?? [];

    // ✅ Email: uniquement depuis Supabase Auth (pas depuis profiles)
    const email = data.user.email ?? undefined;

    // 5) Injection au format UNIQUE et TYPÉ (AuthUser)
    req.user = {
      id: userId,
      email,
      role,
      permissions: effectivePermissions,
    };

    logger.info("✅ Utilisateur authentifié", { userId });

    next();
  } catch (err: unknown) {
    logger.error("🔥 Erreur critique Auth Middleware:", {
      message: err instanceof Error ? err.message : String(err),
    });

    sendError(req, res, 401, "auth_error", "Erreur d'authentification");
    return;
  }
};