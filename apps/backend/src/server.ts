import http from "http";
import app from "./app";
import { ENV } from "./config/env";
import { logger } from "./utils/logger";
import { startScheduler } from "./automation/scheduler";

/**
 * ======================
 * WORKERS BOOTSTRAP
 * ======================
 * IMPORTANT:
 * - Sans ces imports, les jobs BullMQ restent en "waiting"
 * - En prod, tu peux séparer API et Workers dans des services distincts
 */
import "./workers";
import "./workers/ai.worker";
// Optionnel: active si tu veux lancer ces workers dans le même process
// import "./events/event.worker";
// import "./workers/reminder.worker";

if (!ENV.PORT || Number.isNaN(ENV.PORT)) {
  logger.error("❌ Invalid or missing ENV.PORT");
  process.exit(1);
}

const PORT = ENV.PORT;
const SHUTDOWN_TIMEOUT = ENV.SHUTDOWN_TIMEOUT ?? 10_000;

const server = http.createServer(app);

server.listen(PORT, () => {
  logger.info("🚀 ArtisanPro API started", {
    port: PORT,
    env: ENV.NODE_ENV,
  });

  try {
    startScheduler();
    logger.info("🕒 Scheduler initialized");
  } catch (err) {
    logger.error("❌ Scheduler start failed", {
      message: err instanceof Error ? err.message : String(err),
    });
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