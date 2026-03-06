// apps/backend/src/queues/integration.queue.ts
import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";

/**
 * Queue dédiée aux intégrations externes (Pennylane/Sage/EBP/etc.)
 * - Push (ArtisanPro -> outil)
 * - Pull (réconciliation / delta sync)
 * - Traitement async + retries/backoff
 */
export const integrationQueue = new Queue("integrationQueue", {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});