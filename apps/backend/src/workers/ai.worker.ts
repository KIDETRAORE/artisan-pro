import { Worker, Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { runAI } from "../services/ai/gemini.service";
import { logger } from "../utils/logger";

logger.info("👷 [WORKER-AI] Chargement du worker IA...");

/**
 * Worker dédié au traitement des tâches de la queue 'aiQueue'.
 */
export const aiWorker = new Worker(
  "aiQueue",
  async (job: Job) => {
    const { type, fileBase64, mimeType, userId } = job.data;
    
    logger.info(`🔥 [WORKER-AI] Job ${job.id} en cours (Type: ${type})`);

    try {
      // Appel au service Gemini
      const result = await runAI(type, {
        fileBase64,
        mimeType,
        userId
      });

      // Si le service renvoie une string (souvent le cas avec l'IA), 
      // on s'assure que c'est bien traité comme un objet pour le frontend.
      logger.info(`✨ [WORKER-AI] Analyse réussie pour le job ${job.id}`);
      
      return result; 

    } catch (error: any) {
      logger.error(`💥 [WORKER-AI] Erreur sur job ${job.id}: ${error.message}`);
      throw error;
    }
  },
  { 
    connection: redisOptions,
    concurrency: 2 
  }
);

aiWorker.on("completed", (job) => {
  logger.info(`✅ [WORKER-AI] Job ${job.id} terminé avec succès.`);
});

aiWorker.on("failed", (job, err) => {
  logger.error(`❌ [WORKER-AI] Job ${job?.id} a échoué: ${err.message}`);
});