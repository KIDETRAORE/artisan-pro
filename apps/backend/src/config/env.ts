import dotenv from "dotenv";

/**
 * Chargement des variables d'environnement
 * ⚠️ Doit être importé TOUT EN HAUT du projet
 */
dotenv.config();

/**
 * Helpers
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue?: string): string {
  return process.env[name] ?? defaultValue ?? "";
}

function optionalNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  const parsed = value ? Number(value) : defaultValue;

  if (Number.isNaN(parsed)) {
    throw new Error(`❌ Environment variable ${name} must be a number`);
  }

  return parsed;
}

/**
 * =========================
 * CONFIGURATION GLOBALE
 * =========================
 */
export const ENV = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: optionalNumber("PORT", 8080),

  /**
   * =========================
   * SERVER
   * =========================
   */
  SHUTDOWN_TIMEOUT: optionalNumber("SHUTDOWN_TIMEOUT", 10_000),

  /**
   * =========================
   * AUTH / JWT
   * =========================
   */
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),

  ACCESS_TOKEN_EXPIRES_IN: optional("ACCESS_TOKEN_EXPIRES_IN", "15m"),
  REFRESH_TOKEN_EXPIRES_IN: optional("REFRESH_TOKEN_EXPIRES_IN", "7d"),

  /**
   * =========================
   * CORS
   * =========================
   */
  CORS_ORIGIN: optional("CORS_ORIGIN", "http://localhost:5173"),

  /**
   * =========================
   * SUPABASE
   * =========================
   */
  SUPABASE_URL: required("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),

  /**
   * =========================
   * IA / GEMINI
   * =========================
   */
  GEMINI_API_KEY: optional("GEMINI_API_KEY"),

  /**
   * =========================
   * RATE LIMIT / QUOTA
   * =========================
   */
  RATE_LIMIT_WINDOW_MS: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
  RATE_LIMIT_MAX: optionalNumber("RATE_LIMIT_MAX", 100),
};

/**
 * =========================
 * LOG DE CONTRÔLE (DEV)
 * =========================
 */
if (ENV.NODE_ENV === "development") {
  console.log("✅ Environment loaded", {
    PORT: ENV.PORT,
    CORS_ORIGIN: ENV.CORS_ORIGIN,
    SHUTDOWN_TIMEOUT: ENV.SHUTDOWN_TIMEOUT,
  });
}
