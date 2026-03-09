// apps/backend/src/jobs/accountingSync.job.ts
import { Worker, type Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { logger } from "../utils/logger";
import { AccountingSyncService } from "../services/accountingSync.service";
import type { AccountingSource } from "../services/accountingMatching.service";

export type AccountingSyncJobData = {
  userId: string;
  provider: Extract<AccountingSource, "pennylane" | "odoo">;
};

function isSupportedProvider(
  value: string
): value is Extract<AccountingSource, "pennylane" | "odoo"> {
  return value === "pennylane" || value === "odoo";
}

async function processAccountingSyncJob(
  job: Job<AccountingSyncJobData>
): Promise<{
  created: number;
  linked: number;
  upgraded: number;
  ignored: number;
  conflicts: number;
}> {
  const userId = String(job.data?.userId ?? "").trim();
  const provider = String(job.data?.provider ?? "")
    .trim()
    .toLowerCase();

  if (!userId) {
    throw new Error("AccountingSyncJob: missing userId");
  }

  if (!isSupportedProvider(provider)) {
    throw new Error(`AccountingSyncJob: unsupported provider "${provider}"`);
  }

  logger.info("AccountingSyncJob started", {
    jobId: job.id,
    userId,
    provider,
  });

  const result = await AccountingSyncService.syncInvoices(userId, provider);

  logger.info("AccountingSyncJob completed", {
    jobId: job.id,
    userId,
    provider,
    ...result,
  });

  return result;
}

export const accountingSyncWorker = new Worker<AccountingSyncJobData>(
  "accounting-sync",
  processAccountingSyncJob,
  {
    connection: redisOptions,
    concurrency: 2,
  }
);

logger.info("👷 [WORKER-ACCOUNTING-SYNC] Worker loaded");

accountingSyncWorker.on("failed", (job, error) => {
  logger.error("AccountingSyncJob failed", {
    jobId: job?.id,
    userId: job?.data?.userId,
    provider: job?.data?.provider,
    message: error.message,
  });
});

accountingSyncWorker.on("completed", (job, result) => {
  logger.info("AccountingSyncJob worker completed", {
    jobId: job.id,
    userId: job.data.userId,
    provider: job.data.provider,
    result,
  });
});