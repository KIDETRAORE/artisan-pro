import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";

/**
 * Queue dédiée aux analyses IA (Gemini).
 */
export const aiQueue = new Queue("aiQueue", {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },

    // ✅ important: garder un historique raisonnable
    removeOnComplete: { age: 60 * 60, count: 2000 }, // 1h ou 2000 jobs
    removeOnFail: { age: 24 * 60 * 60, count: 2000 }, // 24h ou 2000 jobs
  },
});