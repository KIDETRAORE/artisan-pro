// apps/backend/src/queues/integration.queue.ts
import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";
import { HttpError } from "../utils/httpError";

/**
 * Jobs possibles de la queue intégrations
 */
export type IntegrationJobName = "push_invoice" | "sync_accounting";

/**
 * Providers supportés par le hub comptable
 */
export type IntegrationProvider = "pennylane" | "odoo";

/**
 * Payload standardisé pour les jobs d'intégration
 */
export type PushInvoiceJob = {
  type: "push_invoice";
  userId: string;
  invoiceId: string;
  provider: "pennylane";
};

export type SyncAccountingJob = {
  type: "sync_accounting";
  userId: string;
  provider: IntegrationProvider;
};

/**
 * Union des payloads supportés
 */
export type IntegrationJobPayload = PushInvoiceJob | SyncAccountingJob;

/**
 * Queue dédiée aux intégrations externes (Pennylane/Odoo/Sage/EBP/etc.)
 *
 * Responsabilités :
 * - Push (ArtisanPro -> outil comptable)
 * - Pull / sync comptable
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

function normalizeRequiredString(
  value: string | null | undefined,
  fieldName: string
): string {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new HttpError(400, `${fieldName} is required`);
  }

  return normalized;
}

export async function enqueuePushInvoiceJob(input: {
  userId: string;
  invoiceId: string;
  provider?: "pennylane";
}) {
  const userId = normalizeRequiredString(input.userId, "userId");
  const invoiceId = normalizeRequiredString(input.invoiceId, "invoiceId");
  const provider = input.provider ?? "pennylane";

  return await integrationQueue.add(
    "push_invoice",
    {
      type: "push_invoice",
      userId,
      invoiceId,
      provider,
    },
    {
      jobId: `push_invoice:${provider}:${invoiceId}`,
    }
  );
}

export async function enqueueSyncAccountingJob(input: {
  userId: string;
  provider: IntegrationProvider;
}) {
  const userId = normalizeRequiredString(input.userId, "userId");
  const provider = input.provider;

  return await integrationQueue.add(
    "sync_accounting",
    {
      type: "sync_accounting",
      userId,
      provider,
    },
    {
      jobId: `sync_accounting:${provider}:${userId}`,
    }
  );
}