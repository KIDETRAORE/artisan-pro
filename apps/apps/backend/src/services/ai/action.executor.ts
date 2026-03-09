import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { logger } from "../../utils/logger";

/**
 * Exécute les actions basées sur l'analyse de l'IA
 * ✅ Aucune exécution SQL arbitraire côté Node
 * ✅ Liste blanche d'actions -> RPC dédiées
 */
export async function executeAIAction(userId: string, aiPayload: any) {
  // 1) Normalisation de l'action (majuscules) pour éviter les erreurs de l'IA
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
 * Action spécifique : Création d'un projet via RPC `create_project`
 */
async function createProjectAction(userId: string, data: any) {
  try {
    const { projectName, address } = data;

    // Validation : 'name' est obligatoire (is_nullable: NO)
    const finalName = projectName || "Nouveau Chantier (IA)";

    const { data: rpcData, error } = await supabaseAdmin.rpc("create_project", {
      uid: userId,
      name: finalName,
      address: address || null,
    });

    if (error) {
      throw error;
    }

    const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    logger.info(`✅ [RPC SUCCESS] Projet créé`, {
      projectId: created?.id ?? null,
      userId,
    });

    return created ?? null;
  } catch (error: any) {
    logger.error("❌ [RPC ERROR] Échec de la création du projet", {
      message: error?.message ?? String(error),
      detail: error?.detail,
      userId,
    });

    return {
      error: "Erreur lors de la création du projet",
      message: error?.message ?? String(error),
    };
  }
}