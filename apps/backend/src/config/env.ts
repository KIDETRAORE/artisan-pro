import dotenv from "dotenv";

/**
 * Chargement des variables d'environnement
 * ⚠️ Doit être importé TOUT EN HAUT de app.ts / server.ts
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

function optional(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

/**
 * =========================
 * CONFIGURATION GLOBALE
 * =========================
 */
export const ENV = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: Number(optional("PORT", "8080")),

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
   * IA / GEMINI (si utilisé)
   * =========================
   */
  GEMINI_API_KEY: optional("GEMINI_API_KEY"),

  /**
   * =========================
   * RATE LIMIT / QUOTA
   * =========================
   */
  RATE_LIMIT_WINDOW_MS: Number(optional("RATE_LIMIT_WINDOW_MS", "60000")),
  RATE_LIMIT_MAX: Number(optional("RATE_LIMIT_MAX", "100")),
};

/**
 * =========================
 * LOG DE CONTRÔLE (DEV)
 * =========================
 */
if (ENV.NODE_ENV === "development") {
  console.log("✅ Environment loaded");
}
