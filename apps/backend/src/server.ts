import app from "./app";
import { ENV } from "./config/env";
import { logger } from "./utils/logger";
import { initScheduler } from "./automation/scheduler"; // Import du planificateur

/**
 * ======================
 * Server bootstrap
 * ======================
 */
const PORT = ENV.PORT;

// Fallback sécurisé si non défini dans ENV
const SHUTDOWN_TIMEOUT = (ENV as any).SHUTDOWN_TIMEOUT ?? 10_000;

/**
 * ======================
 * DEBUG — Vérification du port réel
 * ======================
 */
logger.info("PORT CHECK", {
  ENV_PORT: ENV.PORT,
  PROCESS_PORT: process.env.PORT,
});

/**
 * ======================
 * Start server
 * ======================
 */
const server = app.listen(PORT, () => {
  logger.info(`🚀 ArtisanPro API running on port ${PORT}`);
  
  // 🔥 INITIALISATION DES TÂCHES AUTOMATIQUES (CRON)
  try {
    initScheduler();
  } catch (err) {
    logger.error("❌ Erreur lors de l'initialisation du Scheduler", err);
  }
});

/**
 * ======================
 * Graceful shutdown
 * ======================
 */
const shutdown = (signal: string) => {
  logger.info(`⚠️ Received ${signal}. Shutting down gracefully...`);

  server.close(() => {
    logger.info("✅ HTTP server closed");
    process.exit(0);
  });

  // Force exit after timeout
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
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("❌ Unhandled Rejection", reason);
  process.exit(1);
});