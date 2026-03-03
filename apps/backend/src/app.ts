// apps/backend/src/app.ts
import express from "express";
import cors, { type CorsOptions } from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet"; // ✅ ajout

import { ENV } from "./config/env";
import { errorHandler } from "@middlewares/error.middleware";
import { globalRateLimit } from "./middlewares/rateLimit.middleware";
import { logger } from "./utils/logger";
import { applySecurity } from "./middlewares/security.middleware";
import { observabilityMiddleware } from "./middlewares/observability.middleware";
import { sendError } from "./utils/apiError";

// ✅ Central router (toutes les routes business)
import router from "./routes";

// ✅ Stripe webhook (raw body)
import stripeWebhookRoutes from "./routes/stripe.webhook";

// ✅ AJOUT OPENAPI
import openApiRoutes from "./routes/openapi.routes";

const app = express();

const isProd = ENV.NODE_ENV === "production"; // ✅ ajout

/**
 * ======================
 * TRUST PROXY
 * ======================
 */
app.set("trust proxy", 1);

/**
 * ======================
 * SECURITY HEADERS
 * ======================
 */
applySecurity(app);

// ✅ ajout : CSP dev permissif / prod strict (sans nonce)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],

        scriptSrc: isProd
          ? ["'self'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],

        styleSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],

        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],

        connectSrc: [
          "'self'",
          // "https://*.supabase.co",
          // "https://api.stripe.com",
        ],

        frameSrc: [
          "'self'",
          // "https://js.stripe.com",
          // "https://hooks.stripe.com",
        ],
      },
    },
  })
);

/**
 * ======================
 * OBSERVABILITY (REQUEST ID + TIMER)
 * ======================
 */
app.use(observabilityMiddleware);

/**
 * ======================
 * STRIPE WEBHOOK (RAW BODY)
 * ⚠️ Doit être AVANT express.json()
 * ======================
 */
app.use(
  "/stripe/webhook",
  express.raw({
    type: (req) => {
      const ct = req.headers["content-type"] ?? "";
      return typeof ct === "string" && ct.startsWith("application/json");
    },
  }),
  stripeWebhookRoutes
);

/**
 * ======================
 * GLOBAL RATE LIMIT
 * ======================
 */
app.use(globalRateLimit);

/**
 * ======================
 * CORS
 * ======================
 */
const allowedOrigins =
  ENV.NODE_ENV === "production"
    ? [ENV.FRONTEND_URL]
    : ["http://localhost:3000", "http://localhost:5173"];

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error("CORS_NOT_ALLOWED"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
};

app.use(cors(corsOptions));

/**
 * ✅ Handler explicite pour erreurs CORS
 */
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err instanceof Error && err.message === "CORS_NOT_ALLOWED") {
      // ✅ MODIF: sendError attend 5 args (pas de details ici)
      return sendError(req, res, 403, "cors_forbidden", "Origine non autorisée");
    }
    return next(err);
  }
);

/**
 * ======================
 * BODY PARSERS (LIMIT PROTECTION)
 * ======================
 */
app.use(express.json({ limit: "1mb", type: ["application/json"] }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

/**
 * ======================
 * DEV LOGGER
 * ======================
 */
if (ENV.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/**
 * ======================
 * OPENAPI ROUTES
 * ======================
 */
app.use(openApiRoutes);

/**
 * ======================
 * ROUTES (SOURCE UNIQUE)
 * ======================
 */
app.use("/", router);

/**
 * ======================
 * 404
 * ======================
 */
app.use((req, res) => {
  // ✅ MODIF: sendError attend 5 args (pas de details ici)
  return sendError(req, res, 404, "not_found", "Route introuvable");
});

/**
 * ======================
 * ERROR HANDLER
 * ======================
 */
app.use(errorHandler);

logger.info("App initialized", { env: ENV.NODE_ENV });

export default app;