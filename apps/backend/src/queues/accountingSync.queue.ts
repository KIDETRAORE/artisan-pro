// apps/backend/src/queues/accountingSync.queue.ts
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import type { AccountingSource } from "../services/accountingMatching.service";
import {
  integrationQueue,
  enqueueSyncAccountingJob as enqueueIntegrationSyncAccountingJob,
} from "./integration.queue";

export type AccountingSyncQueueJobData = {
  userId: string;
  provider: Extract<AccountingSource, "pennylane" | "odoo">;
};

function isSupportedProvider(
  value: string
): value is Extract<AccountingSource, "pennylane" | "odoo"> {
  return value === "pennylane" || value === "odoo";
}

/**
 * Compat layer:
 * l’ancienne queue accounting-sync est remplacée par integrationQueue.
 * On garde ce symbole exporté pour éviter de casser les imports résiduels.
 */
export const accountingSyncQueue = integrationQueue;

export async function enqueueAccountingSyncJob(params: {
  userId: string;
  provider: Extract<AccountingSource, "pennylane" | "odoo">;
}) {
  const userId = String(params.userId ?? "").trim();
  const provider = String(params.provider ?? "").trim().toLowerCase();

  if (!userId) {
    throw new HttpError(400, "userId is required");
  }

  if (!isSupportedProvider(provider)) {
    throw new HttpError(
      400,
      `Unsupported accounting sync provider: ${provider || "unknown"}`
    );
  }

  const job = await enqueueIntegrationSyncAccountingJob({
    userId,
    provider,
  });

  logger.info("AccountingSyncQueue job enqueued via integrationQueue", {
    jobId: job.id,
    jobName: job.name,
    userId,
    provider,
  });

  return job;
}