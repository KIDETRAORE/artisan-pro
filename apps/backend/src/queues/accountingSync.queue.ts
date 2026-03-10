// apps/backend/src/queues/accountingSync.queue.ts
import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import type { AccountingSource } from "../services/accountingMatching.service";

export type AccountingSyncQueueJobData = {
  userId: string;
  provider: Extract<AccountingSource, "pennylane" | "odoo">;
};

function isSupportedProvider(
  value: string
): value is Extract<AccountingSource, "pennylane" | "odoo"> {
  return value === "pennylane" || value === "odoo";
}

export const accountingSyncQueue = new Queue<AccountingSyncQueueJobData>(
  "accounting-sync",
  {
    connection: redisOptions,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    },
  }
);

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

  const job = await accountingSyncQueue.add(
    "sync-accounting-provider",
    {
      userId,
      provider,
    },
    {
      jobId: `accounting-sync_${provider}_${userId}_${Date.now()}`,
    }
  );

  logger.info("AccountingSyncQueue job enqueued", {
    jobId: job.id,
    jobName: job.name,
    userId,
    provider,
  });

  return job;
}