// apps/backend/src/queues/remindersScan.queue.ts
import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";

/**
 * Queue dédiée au scan quotidien des factures à relancer.
 */
export const remindersScanQueue = new Queue("remindersScanQueue", {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});