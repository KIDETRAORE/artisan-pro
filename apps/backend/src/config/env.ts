import dotenv from "dotenv";

/**
 * ⚠️ Must run before accessing process.env
 */
dotenv.config();

/**
 * =========================
 * Helpers
 * =========================
 */

function clean(value: string | undefined): string | undefined {
  return value?.trim();
}

function required(name: string): string {
  const value = clean(process.env[name]);

  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }

  return value;
}

function optional(name: string, defaultValue?: string): string {
  return clean(process.env[name]) ?? defaultValue ?? "";
}

function optionalNumber(name: string, defaultValue: number): number {
  const value = clean(process.env[name]);
  const parsed = value ? Number(value) : defaultValue;

  if (Number.isNaN(parsed)) {
    throw new Error(`❌ Environment variable ${name} must be a valid number`);
  }

  return parsed;
}

function optionalBoolean(name: string, defaultValue: boolean): boolean {
  const value = clean(process.env[name]);

  if (value === undefined) return defaultValue;

  if (value !== "true" && value !== "false") {
    throw new Error(
      `❌ Environment variable ${name} must be "true" or "false"`
    );
  }

  return value === "true";
}

/**
 * =========================
 * ENVIRONMENT TYPE SAFETY
 * =========================
 */

const NODE_ENV = optional("NODE_ENV", "development");

if (!["development", "production", "test"].includes(NODE_ENV)) {
  throw new Error(
    `❌ NODE_ENV must be "development", "production" or "test"`
  );
}

/**
 * =========================
 * GLOBAL CONFIG
 * =========================
 */

export const ENV = {
  NODE_ENV: NODE_ENV as "development" | "production" | "test",

  PORT: optionalNumber("PORT", 8080),
  SHUTDOWN_TIMEOUT: optionalNumber("SHUTDOWN_TIMEOUT", 10_000),

  /**
   * =========================
   * JWT
   * =========================
   */
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),

  ACCESS_TOKEN_EXPIRES_IN: optional("ACCESS_TOKEN_EXPIRES_IN", "15m"),
  REFRESH_TOKEN_EXPIRES_IN: optional("REFRESH_TOKEN_EXPIRES_IN", "7d"),

  /**
   * =========================
   * FRONTEND / CORS
   * =========================
   */
  FRONTEND_URL: required("FRONTEND_URL"),

  /**
   * =========================
   * DATABASE
   * =========================
   */
  DATABASE_URL: required("DATABASE_URL"),
  SUPABASE_URL: required("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),

  /**
   * =========================
   * STRIPE
   * =========================
   */
  STRIPE_SECRET_KEY: required("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: required("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PRICE_ID: required("STRIPE_PRICE_ID"),

  /**
   * =========================
   * REDIS
   * =========================
   */
  REDIS_URL: optional("REDIS_URL"),
  REDIS_HOST: optional("REDIS_HOST", "127.0.0.1"),
  REDIS_PORT: optionalNumber("REDIS_PORT", 6379),
  REDIS_PASSWORD: optional("REDIS_PASSWORD"),

  /**
   * =========================
   * IA / GEMINI
   * =========================
   */
  GEMINI_API_KEY: optional("GEMINI_API_KEY"),

  /**
   * =========================
   * RATE LIMIT
   * =========================
   */
  RATE_LIMIT_WINDOW_MS: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
  RATE_LIMIT_MAX: optionalNumber("RATE_LIMIT_MAX", 100),

  /**
   * =========================
   * FEATURE FLAGS
   * =========================
   */
  QUOTA_ENABLED: optionalBoolean("QUOTA_ENABLED", false),
  ENABLE_SCHEDULER: optionalBoolean("ENABLE_SCHEDULER", false),
} as const;

/**
 * =========================
 * PRODUCTION SAFETY CHECKS
 * =========================
 */

if (ENV.NODE_ENV === "production") {
  if (!ENV.REDIS_URL && !ENV.REDIS_HOST) {
    throw new Error("❌ Redis configuration missing in production");
  }

  if (ENV.JWT_ACCESS_SECRET.length < 32) {
    throw new Error("❌ JWT_ACCESS_SECRET too short (min 32 chars)");
  }

  if (ENV.JWT_REFRESH_SECRET.length < 32) {
    throw new Error("❌ JWT_REFRESH_SECRET too short (min 32 chars)");
  }

  if (!ENV.FRONTEND_URL.startsWith("https://")) {
    throw new Error("❌ FRONTEND_URL must use HTTPS in production");
  }
}

/**
 * =========================
 * DEV DEBUG (SAFE)
 * =========================
 */

if (ENV.NODE_ENV === "development") {
  console.log("✅ Environment loaded", {
    NODE_ENV: ENV.NODE_ENV,
    PORT: ENV.PORT,
    FRONTEND_URL: ENV.FRONTEND_URL,
    DATABASE_CONFIGURED: !!ENV.DATABASE_URL,
    STRIPE_CONFIGURED: !!ENV.STRIPE_SECRET_KEY,
    REDIS_CONFIGURED: !!(ENV.REDIS_URL || ENV.REDIS_HOST),
    QUOTA_ENABLED: ENV.QUOTA_ENABLED,
    ENABLE_SCHEDULER: ENV.ENABLE_SCHEDULER,
  });
}