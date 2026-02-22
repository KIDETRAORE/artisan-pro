import pool from "../../config/db";
import { logger } from "../../utils/logger";

/**
 * Interface pour la structure de données envoyée par Gemini
 */
interface AIActionPayload {
  action: string;
  data: {
    projectName?: string;
    address?: string;
    details?: string;
  };
}

/**
 * Exécute les actions SQL basées sur l'analyse de l'IA
 */
export async function executeAIAction(userId: string, aiPayload: any) {
  // 1. Normalisation de l'action (majuscules) pour éviter les erreurs de l'IA
  const action = (aiPayload.action || "").toUpperCase();
  const data = aiPayload.data || {};

  logger.info(`Exécution de l'action IA : ${action} pour l'utilisateur ${userId}`);

  switch (action) {
    case "CREATE_PROJECT":
      return await createProjectAction(userId, data);

    case "NONE":
      return null;

    default:
      logger.warn(`[ACTION EXECUTOR] Action non reconnue ou ignorée : ${action}`);
      return null;
  }
}

/**
 * Action spécifique : Création d'un projet dans la table 'projects'
 */
async function createProjectAction(userId: string, data: any) {
  try {
    const { projectName, address } = data;

    // Validation : 'name' est obligatoire (is_nullable: NO)
    const finalName = projectName || "Nouveau Chantier (IA)";

    /**
     * Note sur le schéma : 
     * id -> généré par gen_random_uuid() par défaut
     * created_at -> généré par now() par défaut
     */
    const query = `
      INSERT INTO projects (user_id, name, address)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;

    const values = [
      userId, 
      finalName, 
      address || null // On envoie null si l'IA n'a pas trouvé d'adresse
    ];

    const result = await pool.query(query, values);
    
    logger.info(`✅ [SQL SUCCESS] Projet créé avec ID : ${result.rows[0].id}`);
    
    return result.rows[0];

  } catch (error: any) {
    logger.error("❌ [SQL ERROR] Échec de l'insertion du projet", {
      message: error.message,
      detail: error.detail,
      userId
    });
    
    return { 
      error: "Erreur lors de l'insertion en base de données",
      message: error.message 
    };
  }
}