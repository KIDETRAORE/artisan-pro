import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";

/**
 * Queue dédiée aux analyses IA (Gemini).
 * Sépare les processus lourds des rappels simples.
 */
export const aiQueue = new Queue("aiQueue", {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 2, // Moins d'essais car l'IA coûte des jetons
    backoff: {
      type: "exponential",
      delay: 10000, // On attend plus longtemps avant de réessayer l'IA
    },
    removeOnComplete: true,
  },
});