import { Worker, Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { runAI, AIPayload, AIType } from "../services/ai/gemini.service";
import { logger } from "../utils/logger";

logger.info("👷 [WORKER-AI] Chargement du worker IA...");

export const aiWorker = new Worker(
  "aiQueue",
  async (job: Job) => {
    const { type, payload }: { type: AIType; payload: AIPayload } = job.data;
    logger.info(`🔥 [WORKER-AI] Job ${job.id} reçu pour type: ${type}`);

    try {
      const result = await runAI(type, payload);
      return result; // Le résultat sera stocké dans BullMQ (job.returnvalue)
    } catch (error: any) {
      logger.error(`💥 [WORKER-AI] Erreur sur job ${job.id}: ${error.message}`);
      throw error;
    }
  },
  { 
    connection: redisOptions,
    concurrency: 2 // Tu peux traiter 2 analyses en parallèle
  }
);

aiWorker.on("completed", (job) => logger.info(`✅ [WORKER-AI] Job ${job.id} terminé.`));
aiWorker.on("failed", (job, err) => logger.error(`❌ [WORKER-AI] Job ${job?.id} a échoué: ${err.message}`));