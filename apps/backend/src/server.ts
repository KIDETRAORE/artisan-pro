import http from "http";
import app from "./app";
import { ENV } from "./config/env";
import { logger } from "./utils/logger";
import { initScheduler } from "./automation/scheduler";

/**
 * ======================
 * Environment validation
 * ======================
 */
if (!ENV.PORT || Number.isNaN(ENV.PORT)) {
  logger.error("❌ Invalid or missing ENV.PORT");
  process.exit(1);
}

const PORT = ENV.PORT;
const SHUTDOWN_TIMEOUT = ENV.SHUTDOWN_TIMEOUT ?? 10_000;

/**
 * ======================
 * Create HTTP server
 * ======================
 */
const server = http.createServer(app);

/**
 * ======================
 * Start server
 * ======================
 */
server.listen(PORT, () => {
  logger.info("🚀 ArtisanPro API started", {
    port: PORT,
    env: ENV.NODE_ENV,
  });

  /**
   * Scheduler activation
   * ⚠️ Important:
   * For production scaling, you SHOULD control this via ENV.
   * If you don't have ENABLE_SCHEDULER yet,
   * scheduler will run only in development.
   */
  if (ENV.NODE_ENV === "development") {
    try {
      initScheduler();
      logger.info("🕒 Scheduler initialized (dev mode)");
    } catch (err) {
      logger.error("❌ Scheduler initialization failed", err);
    }
  }
});

/**
 * ======================
 * Graceful shutdown
 * ======================
 */
let isShuttingDown = false;

const shutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn(`⚠️ Received ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    logger.info("✅ HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("❌ Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
};

// OS signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

/**
 * ======================
 * Fatal errors
 * ======================
 */
process.on("uncaughtException", (err: Error) => {
  logger.error("❌ Uncaught Exception", err);
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("❌ Unhandled Rejection", reason);
  shutdown("unhandledRejection");
});