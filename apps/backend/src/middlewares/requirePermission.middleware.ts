import { Request, Response, NextFunction } from "express";
import { Permission } from "@auth/permissions";

/**
 * Middleware requirePermission - Sécurisé selon l'audit
 * Empêche les crashs runtime (TypeError) si les permissions sont absentes.
 */
export const requirePermission = (requiredPermission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Vérification de l'existence de l'utilisateur
    if (!req.user) {
      return res.status(401).json({
        message: "Authentification requise",
      });
    }

    // 2. SÉCURITÉ CRITIQUE : Garde-fou contre le crash "undefined reading includes"
    // On s'assure que permissions est un tableau, même vide, avant d'appeler .includes()
    const permissions = req.user.permissions || [];

    // 3. Vérification de la permission
    const hasPermission = permissions.includes(requiredPermission);

    if (!hasPermission) {
      // Log de sécurité pour l'observabilité (recommandé dans l'audit)
      console.warn(`[Security] Permission denied: User ${req.user.id} attempted action requiring: ${requiredPermission}`);

      return res.status(403).json({
        message: "Action interdite : vous ne possédez pas la permission nécessaire",
        code: "INSUFFICIENT_PERMISSION",
        required: requiredPermission
      });
    }

    // 4. Tout est en règle
    next();
  };
};