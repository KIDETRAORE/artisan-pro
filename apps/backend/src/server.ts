// apps/backend/src/server.ts
import http from "http";
import app from "./app";
import { ENV } from "./config/env";
import { logger } from "./utils/logger";
import { startScheduler } from "./automation/scheduler";
import "./workers/ai.worker";
import "./jobs/accountingSync.job";

// ✅ AJOUT: scheduler relances + workers relances
import { startInvoiceRemindersScheduler } from "./schedulers/reminders.scheduler";
import "./workers/remindersScan.worker";
import "./workers/invoiceReminder.worker";

// ✅ AJOUT: scheduler sync compta
import { startAccountingSyncScheduler } from "./jobs/accountingSync.scheduler";

if (!ENV.PORT || Number.isNaN(ENV.PORT)) {
  logger.error("Invalid or missing ENV.PORT");
  process.exit(1);
}

const PORT = ENV.PORT;
const SHUTDOWN_TIMEOUT = ENV.SHUTDOWN_TIMEOUT ?? 10_000;

const server = http.createServer(app);

server.listen(PORT, () => {
  logger.info("ArtisanPro API started", {
    port: PORT,
    env: ENV.NODE_ENV,
  });

  /**
   * Scheduler multi-instances:
   * piloté par ENV.ENABLE_SCHEDULER && ENV.SCHEDULER_ENABLED
   */
  try {
    startScheduler();
    logger.info("Scheduler start requested", {
      ENABLE_SCHEDULER: ENV.ENABLE_SCHEDULER,
      SCHEDULER_ENABLED: ENV.SCHEDULER_ENABLED,
      REMINDER_CRON: ENV.REMINDER_CRON,
    });
  } catch (err: unknown) {
    logger.error("Scheduler start failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // ✅ AJOUT: scheduler relances (même philosophie, non bloquant)
  try {
    startInvoiceRemindersScheduler();
    logger.info("Invoice reminders scheduler start requested", {
      ENABLE_SCHEDULER: ENV.ENABLE_SCHEDULER,
      SCHEDULER_ENABLED: ENV.SCHEDULER_ENABLED,
      REMINDER_CRON: ENV.REMINDER_CRON,
    });
  } catch (err: unknown) {
    logger.error("Invoice reminders scheduler start failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // ✅ AJOUT: scheduler sync compta
  try {
    startAccountingSyncScheduler();
    logger.info("Accounting sync scheduler start requested", {
      ENABLE_SCHEDULER: ENV.ENABLE_SCHEDULER,
      SCHEDULER_ENABLED: ENV.SCHEDULER_ENABLED,
    });
  } catch (err: unknown) {
    logger.error("Accounting sync scheduler start failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

let isShuttingDown = false;

const shutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn("Starting graceful shutdown", { signal });

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err: Error) => {
  logger.error("Uncaught Exception", { message: err.message });
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("Unhandled Rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
  });
  shutdown("unhandledRejection");
});