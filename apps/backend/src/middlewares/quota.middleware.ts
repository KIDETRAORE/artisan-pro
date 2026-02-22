import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

export const quotaMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;

    if (!user?.id) {
      return res.status(401).json({ success: false, message: "Utilisateur non authentifié" });
    }

    // 🔎 1. Récupération du profil (On récupère aussi la limite pour info)
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("quota_reset_at, monthly_quota_used, monthly_quota_limit, plan")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return res.status(404).json({ success: false, message: "Profil introuvable" });
    }

    const nowTimestamp = Math.floor(Date.now() / 1000);

    // 🔄 2. Reset automatique de période
    if (profile.quota_reset_at && nowTimestamp > profile.quota_reset_at) {
      logger.info(`🔄 Reset du quota mensuel pour l'utilisateur ${user.id}`);
      const nextReset = nowTimestamp + (30 * 24 * 60 * 60);

      await supabaseAdmin
        .from("profiles")
        .update({
          monthly_quota_used: 0,
          quota_reset_at: nextReset
        })
        .eq("id", user.id);
      
      profile.monthly_quota_used = 0; // On met à jour l'objet local pour la suite
    }

    // 🛡 3. Vérification AVANT l'appel IA
    // On vérifie si l'utilisateur a déjà dépassé son quota avant même de lancer Gemini
    if (profile.monthly_quota_used >= (profile.monthly_quota_limit || 50000)) {
        return res.status(403).json({
            success: false,
            message: "Quota mensuel IA dépassé. Passez au plan PRO pour plus d'analyses !",
            usage: profile.monthly_quota_used,
            limit: profile.monthly_quota_limit
          });
    }

    // Note : On ne fait pas l'incrément ici ! 
    // Pourquoi ? Parce qu'on ne connaît pas encore le nombre de tokens que Gemini va renvoyer.
    // L'incrément se fera dans le service Gemini après la réponse.
    
    next();
  } catch (err) {
    logger.error("🔥 Erreur critique Quota Middleware:", err);
    return res.status(500).json({ success: false, message: "Erreur interne" });
  }
};