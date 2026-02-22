/* eslint-disable no-console */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  environment: string;
  level: LogLevel;
  message: string;
  meta?: unknown;
}

/**
 * =========================
 * CONFIG
 * =========================
 */
const ENV = process.env.NODE_ENV ?? "development";
const ENABLE_DEBUG = ENV !== "production";

/**
 * =========================
 * SAFE JSON STRINGIFY
 * =========================
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      error: "Unable to serialize meta",
    });
  }
}

/**
 * =========================
 * SERIALIZE META
 * (Amélioré pour Google Cloud)
 * =========================
 */
function serializeMeta(meta: unknown): unknown {
  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
    };
  }
  // Si c'est déjà un objet, on le retourne tel quel
  return meta;
}

/**
 * =========================
 * FORMAT LOG
 * =========================
 */
function formatLog(
  level: LogLevel,
  message: string,
  meta?: unknown
): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    environment: ENV,
    level,
    message,
  };

  if (meta !== undefined) {
    entry.meta = serializeMeta(meta);
  }

  // Pour Google Cloud Run, le JSON sur une seule ligne est le standard
  return safeStringify(entry);
}

/**
 * =========================
 * LOGGER (Version Phase 1 - Robuste)
 * =========================
 */
export const logger = {
  debug(message: string, meta?: unknown) {
    if (!ENABLE_DEBUG) return;
    console.debug(formatLog("debug", message, meta));
  },

  info(message: string, meta?: unknown) {
    console.info(formatLog("info", message, meta));
  },

  warn(message: string, meta?: unknown) {
    console.warn(formatLog("warn", message, meta));
  },

  // On s'assure que la signature accepte (string, unknown)
  error(message: string, meta?: unknown) {
    console.error(formatLog("error", message, meta));
  },
};