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
    logger.warn("🔁 Redis reconnect attempt", { times });
    return delay;
  },
};

/**
 * =========================
 * Helpers
 * =========================
 */
function buildRedisOptionsFromUrl(redisUrl: string): RedisOptions {
  const u = new URL(redisUrl);

  const isTls = u.protocol === "rediss:";
  const password = u.password ? decodeURIComponent(u.password) : undefined;

  return {
    ...baseOptions,
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    password,
    tls: isTls ? {} : undefined,
  };
}

/**
 * =========================
 * Redis Options for BullMQ
 * =========================
 * ✅ Toujours fournir un objet RedisOptions complet (host/port/...)
 * sinon BullMQ peut échouer.
 */
export const redisOptions: RedisOptions = ENV.REDIS_URL
  ? buildRedisOptionsFromUrl(ENV.REDIS_URL)
  : {
      ...baseOptions,
      host: ENV.REDIS_HOST,
      port: ENV.REDIS_PORT,
      password: ENV.REDIS_PASSWORD || undefined,
    };

/**
 * =========================
 * Redis Instance (shared)
 * =========================
 */
export const redisConnection: Redis = ENV.REDIS_URL
  ? new IORedis(ENV.REDIS_URL, baseOptions)
  : new IORedis(redisOptions);

/**
 * =========================
 * Event listeners (logs safe)
 * =========================
 */
redisConnection.on("connect", () => {
  logger.info("✅ Redis connected");
});

redisConnection.on("ready", () => {
  logger.info("🚀 Redis ready");
});

redisConnection.on("error", (err) => {
  logger.error("❌ Redis error", { message: err instanceof Error ? err.message : String(err) });
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
    logger.error("❌ Error closing Redis connection", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

export default redisConnection;