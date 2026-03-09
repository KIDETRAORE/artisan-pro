// apps/backend/src/queues/integration.queue.ts
import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";

/**
 * Jobs possibles de la queue intégrations
 */
export type IntegrationJobName = "push_invoice";

/**
 * Payload standardisé pour les jobs d'intégration
 */
export type PushInvoiceJob = {
  type: "push_invoice";
  userId: string;
  invoiceId: string;
  provider: "pennylane";
};

/**
 * Union des payloads supportés
 */
export type IntegrationJobPayload = PushInvoiceJob;

/**
 * Queue dédiée aux intégrations externes (Pennylane/Sage/EBP/etc.)
 *
 * Responsabilités :
 * - Push (ArtisanPro -> outil comptable)
 * - Pull (delta sync éventuel)
 * - Retry + backoff
 * - isolation worker
 */
export const integrationQueue = new Queue<IntegrationJobPayload>(
  "integrationQueue",
  {
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
  }
);