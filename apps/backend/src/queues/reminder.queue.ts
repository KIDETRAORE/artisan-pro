// apps/backend/src/queues/reminder.queue.ts
import { Queue } from "bullmq";
import { redisOptions } from "../config/redis"; // On utilise redisOptions au lieu de redisConnection

/**
 * Cette queue centralise toutes les demandes de relances.
 * Elle utilise les options Redis pour éviter les conflits de types ioredis.
 */
export const reminderQueue = new Queue("reminderQueue", {
  connection: redisOptions, // Utilisation de l'objet de config
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false, // ✅ AJOUT : permet d'inspecter les jobs échoués
  },
});