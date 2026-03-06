// apps/backend/src/schedulers/reminders.scheduler.ts
import { remindersScanQueue } from "../queues/remindersScan.queue";
import { logger } from "../utils/logger";

const CRON_TZ = "Europe/Paris";
const CRON_EXPR = "0 2 * * *"; // 02:00 AM tous les jours

const SCAN_JOB_NAME = "invoice_reminders_scan";
const SCAN_JOB_ID = "cron:invoice_reminders_scan";

/**
 * Enregistre un job repeatable BullMQ qui lance le scan tous les jours à 02:00.
 *
 * À appeler AU BOOT du backend (ex: dans app.ts / server.ts).
 */
export async function startInvoiceRemindersScheduler(): Promise<void> {
  try {
    await remindersScanQueue.add(
      SCAN_JOB_NAME,
      {},
      {
        jobId: SCAN_JOB_ID,
        repeat: { pattern: CRON_EXPR, tz: CRON_TZ }, // ✅ MODIF : cron -> pattern
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );

    logger.info("RemindersScheduler: repeatable scan job scheduled", {
      cron: CRON_EXPR,
      tz: CRON_TZ,
      jobId: SCAN_JOB_ID,
    });
  } catch (e) {
    logger.error("RemindersScheduler: failed to schedule repeatable scan job", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}