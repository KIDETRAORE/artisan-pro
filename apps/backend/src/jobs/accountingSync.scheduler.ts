// apps/backend/src/jobs/accountingSync.scheduler.ts
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { enqueueAccountingSyncJob } from "../queues/accountingSync.queue";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

let accountingSyncSchedulerStarted = false;
let accountingSyncSchedulerTimer: NodeJS.Timeout | null = null;

type IntegrationRow = {
  user_id: string;
  provider: string;
  status: string | null;
};

function isSupportedProvider(
  value: string
): value is "pennylane" | "odoo" {
  return value === "pennylane" || value === "odoo";
}

async function scheduleEnabledIntegrations(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("user_id, provider, status")
    .in("provider", ["pennylane", "odoo"])
    .eq("status", "connected");

  if (error) {
    logger.error("AccountingSyncScheduler integrations lookup failed", {
      message: error.message,
    });
    return;
  }

  const rows = (data ?? []) as IntegrationRow[];

  for (const row of rows) {
    const userId = String(row.user_id ?? "").trim();
    const provider = String(row.provider ?? "").trim().toLowerCase();

    if (!userId || !isSupportedProvider(provider)) {
      continue;
    }

    try {
      await enqueueAccountingSyncJob({
        userId,
        provider,
      });
    } catch (err) {
      logger.warn("AccountingSyncScheduler enqueue failed", {
        userId,
        provider,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function runAccountingSyncSchedulerTick(): Promise<void> {
  logger.info("AccountingSyncScheduler tick started");

  try {
    await scheduleEnabledIntegrations();
    logger.info("AccountingSyncScheduler tick completed");
  } catch (err) {
    logger.error("AccountingSyncScheduler tick failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export function startAccountingSyncScheduler(
  intervalMs: number = DEFAULT_INTERVAL_MS
): void {
  if (accountingSyncSchedulerStarted) {
    return;
  }

  accountingSyncSchedulerStarted = true;

  void runAccountingSyncSchedulerTick();

  accountingSyncSchedulerTimer = setInterval(() => {
    void runAccountingSyncSchedulerTick();
  }, intervalMs);

  logger.info("AccountingSyncScheduler started", {
    intervalMs,
  });
}

export function stopAccountingSyncScheduler(): void {
  if (accountingSyncSchedulerTimer) {
    clearInterval(accountingSyncSchedulerTimer);
    accountingSyncSchedulerTimer = null;
  }

  accountingSyncSchedulerStarted = false;

  logger.info("AccountingSyncScheduler stopped");
}