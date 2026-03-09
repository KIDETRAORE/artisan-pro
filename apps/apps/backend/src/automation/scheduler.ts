import cron from "node-cron";
import Redis from "ioredis";
import { redisOptions } from "../config/redis";
import { logger } from "../utils/logger";
import { ENV } from "../config/env";
import { runReminderAutomation } from "./automation.engine";

/**
 * =========================================================
 * Scheduler multi-instances (Cloud Run / PM2 / etc.)
 *
 * - Cron tourne sur toutes les instances
 * - Mais une seule instance (leader) exécute réellement les automations
 *   grâce à un lock Redis (SET NX PX + renew + release safe via Lua)
 *
 * - Aucun appel direct à BullMQ Worker (un Worker n'est pas callable).
 *   On appelle l'engine (runReminderAutomation) qui push des jobs / orchestre.
 * =========================================================
 */

// Feature flags
const ENABLED = ENV.ENABLE_SCHEDULER && ENV.SCHEDULER_ENABLED;

// Cron (par défaut toutes les 5 minutes)
const REMINDER_CRON = ENV.REMINDER_CRON;

// Redis lock
const LOCK_KEY = ENV.SCHEDULER_LOCK_KEY;
const LOCK_TTL_MS = ENV.SCHEDULER_LOCK_TTL_MS;

// On renouvelle le lock avant expiration (ex: TTL=60s => renew toutes 30s)
const LOCK_RENEW_EVERY_MS = Math.max(1_000, Math.floor(LOCK_TTL_MS / 2));

// Token d'instance (valeur stockée dans Redis pour prouver qu'on est owner)
const INSTANCE_ID =
  ENV.INSTANCE_ID ||
  `pid:${process.pid}:${Math.random().toString(16).slice(2)}:${Date.now()}`;

// Redis client dédié au scheduler (évite de mélanger avec BullMQ connection)
const redis = new Redis(redisOptions as any);

// État local
let renewTimer: NodeJS.Timeout | null = null;
let cronStarted = false;

/**
 * Lua: renew uniquement si owner
 * if get(key)==token then pexpire(key, ttl) else 0
 */
const RENEW_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

/**
 * Lua: release uniquement si owner
 * if get(key)==token then del(key) else 0
 */
const RELEASE_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

async function acquireLock(): Promise<boolean> {
  try {
    // SET key token PX ttl NX
    const res = await redis.set(LOCK_KEY, INSTANCE_ID, "PX", LOCK_TTL_MS, "NX");
    return res === "OK";
  } catch (err: unknown) {
    logger.error("[Scheduler] Redis acquire lock failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function renewLock(): Promise<boolean> {
  try {
    const res = await redis.eval(
      RENEW_LUA,
      1,
      LOCK_KEY,
      INSTANCE_ID,
      String(LOCK_TTL_MS)
    );
    return Number(res) === 1;
  } catch (err: unknown) {
    logger.error("[Scheduler] Redis renew lock failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await redis.eval(RELEASE_LUA, 1, LOCK_KEY, INSTANCE_ID);
  } catch (err: unknown) {
    logger.error("[Scheduler] Redis release lock failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Leader loop: acquire + periodic renew
 */
async function ensureLeadership(): Promise<boolean> {
  // déjà leader si renewTimer actif
  if (renewTimer) return true;

  const ok = await acquireLock();
  if (!ok) return false;

  logger.info("[Scheduler] Leader acquired", {
    instanceId: INSTANCE_ID,
    lockKey: LOCK_KEY,
    ttlMs: LOCK_TTL_MS,
  });

  renewTimer = setInterval(async () => {
    const renewed = await renewLock();
    if (!renewed) {
      logger.warn("[Scheduler] Lost leadership (lock not renewed)", {
        instanceId: INSTANCE_ID,
      });
      if (renewTimer) clearInterval(renewTimer);
      renewTimer = null;
    }
  }, LOCK_RENEW_EVERY_MS);

  return true;
}

/**
 * One tick: only leader executes.
 * Never throws out of cron.
 */
async function tick(): Promise<void> {
  try {
    const leader = await ensureLeadership();
    if (!leader) {
      logger.debug("[Scheduler] Follower instance, skipping tick", {
        instanceId: INSTANCE_ID,
      });
      return;
    }

    logger.info("[Scheduler] Running reminder automation", {
      instanceId: INSTANCE_ID,
    });

    await runReminderAutomation();
  } catch (err: unknown) {
    logger.error("[Scheduler] Tick failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Start scheduler
 */
export function startScheduler(): void {
  if (cronStarted) return;
  cronStarted = true;

  if (!ENABLED) {
    logger.info("[Scheduler] Disabled", {
      instanceId: INSTANCE_ID,
      ENABLE_SCHEDULER: ENV.ENABLE_SCHEDULER,
      SCHEDULER_ENABLED: ENV.SCHEDULER_ENABLED,
    });
    return;
  }

  if (!cron.validate(REMINDER_CRON)) {
    throw new Error(`❌ Invalid REMINDER_CRON: ${REMINDER_CRON}`);
  }

  logger.info("[Scheduler] Starting", {
    instanceId: INSTANCE_ID,
    cron: REMINDER_CRON,
    lockKey: LOCK_KEY,
    ttlMs: LOCK_TTL_MS,
    renewEveryMs: LOCK_RENEW_EVERY_MS,
  });

  // Schedule cron: do not await, keep event loop clean
  cron.schedule(REMINDER_CRON, () => {
    void tick();
  });

  // Shutdown: release leadership if we had it
  const shutdown = async () => {
    logger.info("[Scheduler] Shutting down", { instanceId: INSTANCE_ID });

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
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}