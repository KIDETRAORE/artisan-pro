import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // 1. Vérification de la présence du header Authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("🔐 Tentative d'accès sans token");
      res.status(401).json({ success: false, message: "Non authentifié : Token manquant" });
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    // 2. Validation du token auprès de Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      logger.warn(`🔐 Token invalide ou expiré : ${error?.message || "User non trouvé"}`);
      res.status(401).json({ success: false, message: "Session invalide ou expirée" });
      return;
    }

    // 3. 🔥 Injection du user dans la requête pour les middlewares suivants (ex: quotaMiddleware)
    (req as any).user = data.user;

    logger.info(`✅ Utilisateur authentifié : ${data.user.email}`);

    next();
  } catch (error: any) {
    logger.error("🔥 Erreur critique Auth Middleware:", error);
    res.status(401).json({ success: false, message: "Erreur d'authentification" });
  }
};