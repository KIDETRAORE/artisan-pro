// apps/backend/src/app.ts
import express from "express";
import cors, { type CorsOptions } from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { ENV } from "./config/env";
import { errorHandler } from "./middlewares/error.middleware";
import { globalRateLimit } from "./middlewares/rateLimit.middleware";
import { logger } from "./utils/logger";
import { applySecurity } from "./middlewares/security.middleware";

// ✅ Central router (toutes les routes business)
import router from "./routes";

// ✅ Stripe webhook (raw body)
import stripeWebhookRoutes from "./routes/stripe.webhook";

const app = express();

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

/**
 * ======================
 * STRIPE WEBHOOK (RAW BODY)
 * ⚠️ Doit être AVANT express.json()
 * ======================
 *
 * Stripe envoie parfois "application/json; charset=utf-8"
 * donc on accepte application/json* via type function.
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
    // requêtes server-to-server / curl / health probes
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error("CORS_NOT_ALLOWED"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
};

app.use(cors(corsOptions));
// Preflight
app.options("*", cors(corsOptions));

/**
 * ✅ Handler explicite pour erreurs CORS
 */
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err instanceof Error && err.message === "CORS_NOT_ALLOWED") {
      return res.status(403).json({ success: false, error: "CORS not allowed" });
    }
    return next(err);
  }
);

/**
 * ======================
 * BODY PARSERS (LIMIT PROTECTION)
 * ======================
 * 🔒 Réduction des tailles pour éviter DoS / payloads abusifs
 * ⚠️ N'impacte PAS Stripe (raw body déjà traité plus haut)
 */
app.use(express.json({ limit: "1mb" }));
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
 * ROUTES (SOURCE UNIQUE)
 * ======================
 */
app.use("/", router);

/**
 * ======================
 * 404
 * ======================
 */
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

/**
 * ======================
 * ERROR HANDLER
 * ======================
 */
app.use(errorHandler);

logger.info("App initialized", { env: ENV.NODE_ENV });

export default app;