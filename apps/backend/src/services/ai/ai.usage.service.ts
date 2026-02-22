import { v4 as uuidv4 } from "uuid";
import pool from "../../config/db";
import { logger } from "../../utils/logger";

/**
 * Service de tracking de la consommation IA (Phase 2 - Contextuelle)
 */
export async function trackAiUsage(
  userId: string, 
  feature: "vocal" | "vision" | "compta", 
  estimatedTokens: number = 1
) {
  try {
    const id = uuidv4();

    // Utilisation d'une transaction pour garantir la cohérence
    await pool.query("BEGIN");

    // 1. Insertion dans l'historique détaillé
    await pool.query(
      `INSERT INTO ai_usage (id, user_id, feature, tokens_estimated, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [id, userId, feature, estimatedTokens]
    );

    // 2. Mise à jour du compteur rapide dans le profil de l'artisan
    await pool.query(
      `UPDATE profiles 
       SET monthly_quota_used = COALESCE(monthly_quota_used, 0) + $1 
       WHERE id = $2`,
      [estimatedTokens, userId]
    );

    await pool.query("COMMIT");

    logger.debug(`[AI TRACKING] ${feature} pour ${userId} (+${estimatedTokens})`);
    
  } catch (error) {
    await pool.query("ROLLBACK");
    // On log l'erreur mais on ne bloque pas le flux principal
    logger.error("Erreur lors du tracking de l'usage IA", { error, userId });
  }
}