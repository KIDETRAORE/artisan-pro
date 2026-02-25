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

// ✅ Scheduler (leader election Redis)
import { startScheduler } from "./automation/scheduler";

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
 */
app.use(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
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
    return callback(new Error("CORS not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/**
 * ======================
 * BODY PARSERS (LIMIT PROTECTION)
 * ======================
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
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
 * ✅ /health est déjà géré dans routes/index.ts via healthRoutes
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

/**
 * ======================
 * SCHEDULER (leader election via Redis)
 * ✅ OK en multi-instances: une seule instance exécute réellement les jobs grâce au lock.
 * ======================
 */
try {
  startScheduler();
} catch (err) {
  logger.error("Scheduler start failed", {
    message: err instanceof Error ? err.message : String(err),
  });
}

logger.info(`✅ App initialized in ${ENV.NODE_ENV} mode`);

export default app;