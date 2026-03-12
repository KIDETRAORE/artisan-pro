// apps/backend/src/workers/remindersScan.worker.ts
import { Worker, type Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { reminderQueue } from "../queues/reminder.queue";

const REMINDABLE_STATUSES = ["sent", "overdue"] as const;
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_REMINDERS = 10;

async function enqueueInvoiceRemindersNow(): Promise<{
  scanned: number;
  enqueued: number;
  skippedCooldown: number;
  skippedMax: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();

  const { data, error } = await supabaseAdmin
    .from("sales_invoices")
    .select("id, user_id, status, due_date, reminder_count, last_reminder_at")
    .in("status", [...REMINDABLE_STATUSES])
    .lt("due_date", nowIso);

  if (error) {
    logger.error("RemindersScanWorker: failed to load overdue sales invoices", {
      message: error.message,
    });
    return { scanned: 0, enqueued: 0, skippedCooldown: 0, skippedMax: 0 };
  }

  const invoices = (data ?? []) as Array<{
    id: string;
    user_id: string;
    status: string;
    due_date: string;
    reminder_count: number | null;
    last_reminder_at: string | null;
  }>;

  let enqueued = 0;
  let skippedCooldown = 0;
  let skippedMax = 0;

  for (const inv of invoices) {
    const reminderCount = inv.reminder_count ?? 0;

    if (reminderCount >= MAX_REMINDERS) {
      skippedMax += 1;
      continue;
    }

    if (inv.last_reminder_at) {
      const last = new Date(inv.last_reminder_at).getTime();
      if (Number.isFinite(last) && now.getTime() - last < REMINDER_COOLDOWN_MS) {
        skippedCooldown += 1;
        continue;
      }
    }

    try {
      await reminderQueue.add(
        "invoice_reminder",
        {
          invoiceId: inv.id,
          userId: inv.user_id,
        },
        {
          jobId: `invoice_reminder:${inv.id}`,
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      );
      enqueued += 1;
    } catch {
      logger.warn(
        "RemindersScanWorker: failed to enqueue sales invoice reminder",
        {
          invoiceId: inv.id,
          userId: inv.user_id,
        }
      );
    }
  }

  logger.info("RemindersScanWorker: scan complete", {
    scanned: invoices.length,
    enqueued,
    skippedCooldown,
    skippedMax,
  });

  return { scanned: invoices.length, enqueued, skippedCooldown, skippedMax };
}

export const remindersScanWorker = new Worker(
  "remindersScanQueue",
  async (job: Job) => {
    if (job.name !== "invoice_reminders_scan") {
      logger.warn("⚠️ [WORKER-REMINDERS-SCAN] Unknown job name", {
        jobId: job.id,
        name: job.name,
      });
      return { ok: false, reason: "unknown_job_name" };
    }

    logger.info("🔎 [WORKER-REMINDERS-SCAN] Scan start", {
      jobId: job.id,
      name: job.name,
    });

    const result = await enqueueInvoiceRemindersNow();

    logger.info("✅ [WORKER-REMINDERS-SCAN] Scan done", {
      jobId: job.id,
      ...result,
    });

    return {
      ok: true,
      ...result,
    };
  },
  {
    connection: redisOptions,
  }
);

logger.info("👷 [WORKER-REMINDERS-SCAN] Worker loaded");