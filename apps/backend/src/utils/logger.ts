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
 * (évite crash sur objets circulaires)
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

  return safeStringify(entry);
}

/**
 * =========================
 * LOGGER
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

  error(message: string, meta?: unknown) {
    console.error(formatLog("error", message, meta));
  },
};
