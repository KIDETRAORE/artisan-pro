import cors, { CorsOptions } from "cors";
import { ENV } from "../config/env";

/**
 * ======================
 * Allowed origins
 * ======================
 * En production :
 * - uniquement ENV.FRONTEND_URL
 * En développement :
 * - autoriser tout (ou apps locales)
 */

const allowedOrigins = ENV.FRONTEND_URL
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * ======================
 * CORS Options
 * ======================
 */

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // 🔧 DEV : autorise tout (Postman, curl, localhost, mobile, etc.)
    if (ENV.NODE_ENV !== "production") {
      return callback(null, true);
    }

    // 🔒 PROD : autorise uniquement FRONTEND_URL
    if (!origin) {
      return callback(null, false);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`❌ CORS blocked for origin: ${origin}`));
  },

  // ✅ nécessaire (refresh token httpOnly)
  credentials: true,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  // ✅ headers strictement nécessaires
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-Id",
  ],

  // ❌ ne pas exposer Authorization
  exposedHeaders: [],

  maxAge: 86400, // cache preflight 24h
};

/**
 * ======================
 * Export middleware
 * ======================
 */

export const corsMiddleware = cors(corsOptions);