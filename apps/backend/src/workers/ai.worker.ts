import { Worker, type Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { runAI, type AIType } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { logger } from "../utils/logger";

logger.info("👷 [WORKER-AI] Chargement du worker IA...");

function isAIType(x: unknown): x is AIType {
  return (
    x === "assistant" ||
    x === "devis" ||
    x === "compta" ||
    x === "vision" ||
    x === "relance" ||
    x === "vocal"
  );
}

function toAIType(type: unknown): AIType {
  const t = String(type ?? "").toLowerCase();
  if (isAIType(t)) return t;
  // fallback sûr (valeur valide de AIType)
  return "assistant";
}

/**
 * Pour le quotaService, on garde une feature string.
 * Ici, on utilise la même valeur que AIType (ou "ai" si inconnu),
 * pour rester compatible avec ton quotaService.checkQuota(feature: string).
 */
function toQuotaFeature(type: unknown): string {
  const t = String(type ?? "").toLowerCase();
  return isAIType(t) ? t : "ai";
}

/**
 * Worker dédié au traitement des tâches de la queue 'aiQueue'.
 * P1:
 * - pré-check quota avant coût IA
 * - consommation quota après succès (bloquant)
 */
export const aiWorker = new Worker(
  "aiQueue",
  async (job: Job) => {
    const { type, fileBase64, mimeType, userId, prompt } = job.data as {
      type?: unknown;
      fileBase64?: string;
      mimeType?: string;
      userId?: string;
      prompt?: string;
    };

    if (!userId) {
      throw new Error("missing_user_id");
    }

    const aiType = toAIType(type);
    const feature = toQuotaFeature(type);

    logger.info(`🔥 [WORKER-AI] Job ${job.id} en cours`, { type, aiType, feature, userId });

    // ✅ Pré-check quota (évite coût IA)
    const q = await quotaService.checkQuota(userId, feature);
    if (!q.allowed) {
      logger.warn("🚫 [WORKER-AI] Quota bloqué", {
        jobId: job.id,
        userId,
        feature,
        reason: q.reason ?? "unknown",
      });
      throw new Error("quota_exceeded");
    }

    try {
      // ✅ Appel IA (type strict)
      const result = await runAI(aiType, {
        prompt,
        fileBase64,
        mimeType,
        userId,
      });

      // ✅ Consommation quota APRÈS succès (bloquant)
      await quotaService.recordUsage(
        userId,
        feature,
        typeof prompt === "string" ? prompt : "worker-input",
        result
      );

      logger.info(`✅ [WORKER-AI] Job ${job.id} terminé avec succès.`, {
        userId,
        aiType,
        feature,
      });

      return result;
    } catch (error: unknown) {
      logger.error(`💥 [WORKER-AI] Erreur sur job ${job.id}`, {
        userId,
        aiType,
        feature,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
  {
    connection: redisOptions,
    concurrency: 2,
  }
);

aiWorker.on("completed", (job) => {
  logger.info(`✅ [WORKER-AI] Job ${job.id} completed.`);
});

aiWorker.on("failed", (job, err) => {
  logger.error(`❌ [WORKER-AI] Job ${job?.id} failed`, { message: err.message });
});