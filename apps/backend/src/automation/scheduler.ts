// apps/backend/src/automation/scheduler.ts
import cron from "node-cron";
import Redis from "ioredis";
import { redisOptions } from "../config/redis";
import { logger } from "../utils/logger";
import { runReminderAutomation } from "./automation.engine";

/**
 * =========================================================
 * Scalabilité: Distributed cron + Redis lock
 * - Une seule instance "leader" exécute les automations
 * - Les autres n'exécutent rien
 * =========================================================
 */

/**
 * ✅ Idempotency: évite double démarrage (tsx watch / import / appels multiples)
 */
let schedulerStarted = false;
let shutdownHooksRegistered = false;

// Active/désactive facilement le scheduler (supporte les 2 noms d'ENV)
const SCHEDULER_ENABLED =
  process.env.ENABLE_SCHEDULER !== "false" &&
  process.env.SCHEDULER_ENABLED !== "false";

// Cron: toutes les 5 minutes (à ajuster)
const REMINDER_CRON = process.env.REMINDER_CRON ?? "*/5 * * * *";

// Lock Redis
const LOCK_KEY = process.env.SCHEDULER_LOCK_KEY ?? "artisanpro:scheduler:leader";
const LOCK_TTL_MS = Number(process.env.SCHEDULER_LOCK_TTL_MS ?? 60_000); // 60s
const LOCK_RENEW_EVERY_MS = Math.floor(LOCK_TTL_MS / 2); // renew à mi-ttl

// Identité unique d’instance (token lock)
const INSTANCE_ID =
  process.env.INSTANCE_ID ?? `${process.pid}:${Math.random().toString(16).slice(2)}`;

// Redis client dédié scheduler (ne pas réutiliser BullMQ connection)
const redis = new Redis(redisOptions as any);

let renewTimer: NodeJS.Timeout | null = null;

/**
 * Acquire lock (SET key value NX PX ttl)
 */
async function acquireLock(): Promise<boolean> {
  try {
    const res = await redis.set(LOCK_KEY, INSTANCE_ID, "PX", LOCK_TTL_MS, "NX");
    return res === "OK";
  } catch (err) {
    logger.error("Scheduler: Redis lock acquire failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Renew lock (only if still owner)
 * Lua script: if get(key)==token then pexpire(key, ttl) else 0
 */
const RENEW_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

async function renewLock(): Promise<boolean> {
  try {
    const res = await redis.eval(RENEW_LUA, 1, LOCK_KEY, INSTANCE_ID, String(LOCK_TTL_MS));
    return Number(res) === 1;
  } catch (err) {
    logger.error("Scheduler: Redis lock renew failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Release lock (only if owner)
 * Lua script: if get(key)==token then del(key) else 0
 */
const RELEASE_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

async function releaseLock(): Promise<void> {
  try {
    await redis.eval(RELEASE_LUA, 1, LOCK_KEY, INSTANCE_ID);
  } catch (err) {
    logger.error("Scheduler: Redis lock release failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Ensure leader: try acquire, if success start renewal loop.
 * If renewal fails => stop renewal, become follower.
 */
async function ensureLeader(): Promise<boolean> {
  const acquired = await acquireLock();
  if (!acquired) return false;

  logger.info("Scheduler: became leader", { instanceId: INSTANCE_ID });

  // renewal loop
  renewTimer = setInterval(async () => {
    const ok = await renewLock();
    if (!ok) {
      logger.warn("Scheduler: lost leadership", { instanceId: INSTANCE_ID });
      if (renewTimer) clearInterval(renewTimer);
      renewTimer = null;
    }
  }, LOCK_RENEW_EVERY_MS);

  return true;
}

/**
 * Run one cron tick safely (never throws out)
 */
async function safeRunReminderTick(): Promise<void> {
  try {
    // Si on n'a pas de renewal timer, on n'est pas leader
    if (!renewTimer) {
      const leader = await ensureLeader();
      if (!leader) {
        logger.debug("Scheduler: follower instance, skipping tick", { instanceId: INSTANCE_ID });
        return;
      }
    }

    // leader: exécuter l’automation
    logger.info("Scheduler: running reminder automation", { instanceId: INSTANCE_ID });
    await runReminderAutomation();
  } catch (err) {
    // ✅ gestion erreur cron : on log, et le prochain tick réessaiera
    logger.error("Scheduler: reminder automation failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function shutdownScheduler(): Promise<void> {
  logger.info("Scheduler: shutting down", { instanceId: INSTANCE_ID });

  if (renewTimer) {
    clearInterval(renewTimer);
    renewTimer = null;
  }

  await releaseLock();

  try {
    await redis.quit();
  } catch {
    // ignore
  }
}

/**
 * Start scheduler
 */
export function startScheduler(): void {
  if (schedulerStarted) {
    logger.warn("Scheduler: already started (skipping)", { instanceId: INSTANCE_ID });
    return;
  }

  if (!SCHEDULER_ENABLED) {
    logger.info("Scheduler: disabled via env", { instanceId: INSTANCE_ID });
    return;
  }

  schedulerStarted = true;

  logger.info("Scheduler: starting", {
    instanceId: INSTANCE_ID,
    cron: REMINDER_CRON,
    lockKey: LOCK_KEY,
    ttlMs: LOCK_TTL_MS,
  });

  // cron tick
  cron.schedule(REMINDER_CRON, () => {
    void safeRunReminderTick();
  });

  // Shutdown clean (register once)
  if (!shutdownHooksRegistered) {
    shutdownHooksRegistered = true;
    process.on("SIGTERM", () => void shutdownScheduler());
    process.on("SIGINT", () => void shutdownScheduler());
  }
}