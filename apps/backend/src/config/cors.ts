import cors, { CorsOptions } from "cors";
import { ENV } from "../config/env";

/**
 * ======================
 * Allowed origins
 * ======================
 * En production :
 * FRONTEND_URL peut contenir plusieurs domaines séparés par virgule
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
    /**
     * Autorise :
     * - appels serveur à serveur
     * - Postman
     * - curl
     * - mobile app native
     */
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(
      new Error(`❌ CORS blocked for origin: ${origin}`)
    );
  },

  credentials: true, // obligatoire pour cookies httpOnly
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
  ],

  exposedHeaders: ["Authorization"],

  maxAge: 86400, // cache preflight 24h
};

/**
 * ======================
 * Export middleware
 * ======================
 */

export const corsMiddleware = cors(corsOptions);