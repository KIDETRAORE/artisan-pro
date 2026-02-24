import IORedis, { Redis, RedisOptions } from "ioredis";
import { ENV } from "./env";
import { logger } from "../utils/logger";

/**
 * =========================
 * Base options (BullMQ safe)
 * =========================
 */

const baseOptions: RedisOptions = {
  maxRetriesPerRequest: null, // obligatoire pour BullMQ
  enableReadyCheck: true,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`🔁 Redis reconnect attempt #${times}`);
    return delay;
  },
};

/**
 * =========================
 * Redis Options for BullMQ
 * =========================
 */

export const redisOptions: RedisOptions = ENV.REDIS_URL
  ? {
      ...baseOptions,
      tls: ENV.REDIS_URL.startsWith("rediss://") ? {} : undefined,
    }
  : {
      ...baseOptions,
      host: ENV.REDIS_HOST,
      port: ENV.REDIS_PORT,
      password: ENV.REDIS_PASSWORD || undefined,
    };

/**
 * =========================
 * Redis Instance (typed properly)
 * =========================
 */

let redisConnection: Redis;

if (ENV.REDIS_URL) {
  // Cas 1: URL (Redis Cloud / Railway / Upstash)
  redisConnection = new IORedis(ENV.REDIS_URL, baseOptions);
} else {
  // Cas 2: Host / Port (local dev / docker)
  redisConnection = new IORedis(redisOptions);
}

export { redisConnection };

/**
 * =========================
 * Event listeners
 * =========================
 */

redisConnection.on("connect", () => {
  logger.info("✅ Redis connected");
});

redisConnection.on("ready", () => {
  logger.info("🚀 Redis ready");
});

redisConnection.on("error", (err) => {
  logger.error("❌ Redis error", err);
});

redisConnection.on("close", () => {
  logger.warn("⚠️ Redis connection closed");
});

/**
 * =========================
 * Graceful shutdown
 * =========================
 */

export const closeRedis = async (): Promise<void> => {
  try {
    await redisConnection.quit();
    logger.info("✅ Redis connection closed");
  } catch (err) {
    logger.error("❌ Error closing Redis connection", err);
  }
};