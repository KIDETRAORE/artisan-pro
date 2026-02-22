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

    // 🔎 1. Récupération du profil
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("quota_reset_at, monthly_quota_used, plan")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return res.status(404).json({ success: false, message: "Profil introuvable" });
    }

    const nowTimestamp = Math.floor(Date.now() / 1000);

    // 🔄 2. Reset automatique de période
    // Si la date de reset est passée, on remet à zéro ET on décale la date au mois suivant
    if (profile.quota_reset_at && nowTimestamp > profile.quota_reset_at) {
      logger.info(`🔄 Reset du quota mensuel pour l'utilisateur ${user.id}`);
      
      // On calcule la nouvelle date de reset (Date actuelle + 30 jours)
      const nextReset = nowTimestamp + (30 * 24 * 60 * 60);

      await supabaseAdmin
        .from("profiles")
        .update({
          monthly_quota_used: 0,
          quota_reset_at: nextReset
        })
        .eq("id", user.id);
      
      // Note: On ne bloque pas ici, on laisse l'incrément se faire sur un compteur frais
    }

    // 🛡 3. Incrément atomique sécurisé (RPC)
    const { data: allowed, error: rpcError } = await supabaseAdmin.rpc(
      "increment_quota_if_allowed",
      { _user_id: user.id }
    );

    if (rpcError) {
      logger.error("❌ Erreur RPC Quota:", rpcError);
      return res.status(500).json({ success: false, message: "Erreur vérification quota" });
    }

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "Quota mensuel IA dépassé. Passez au plan PRO pour plus d'analyses !",
      });
    }

    next();
  } catch (err) {
    logger.error("🔥 Erreur critique Quota Middleware:", err);
    return res.status(500).json({ success: false, message: "Erreur interne" });
  }
};