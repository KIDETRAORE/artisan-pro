import app from "./app";
import { env } from "./config/env";

/**
 * ======================
 * Server bootstrap
 * ======================
 */
const PORT = env.PORT;

/**
 * ======================
 * Start server
 * ======================
 */
const server = app.listen(PORT, () => {
  console.log(`🚀 ArtisanPro API running on port ${PORT}`);
});

/**
 * ======================
 * Graceful shutdown
 * ======================
 */
const shutdown = (signal: string) => {
  console.log(`⚠️ Received ${signal}. Shutting down gracefully...`);

  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error("❌ Forced shutdown");
    process.exit(1);
  }, 10000);
};

// OS signals
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/**
 * ======================
 * Fatal errors
 * ======================
 */
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  process.exit(1);
});
