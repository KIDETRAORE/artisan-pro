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
    // requêtes server-to-server / curl / health probes
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    // on renvoie une erreur (sera traitée par notre handler CORS juste après)
    return callback(new Error("CORS_NOT_ALLOWED"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/**
 * ✅ Handler explicite pour erreurs CORS
 * (sinon ça peut partir en 500 opaque)
 */
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof Error && err.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({ success: false, error: "CORS not allowed" });
  }
  return next(err);
});

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
 * ======================
 */
app.use("/", router);

/**
 * (Optionnel) Health fallback si tu veux un endpoint toujours dispo,
 * même si le router change.
 */
// app.get("/health", (_req, res) => {
//   res.status(200).json({ status: "ok", service: "ArtisanPro Backend", env: ENV.NODE_ENV });
// });

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
 *
 * Reco: éviter de lancer en dev/watch si tu ne veux pas spammer des jobs.
 * Si tu veux l’activer en dev aussi, supprime le if.
 */
try {
  if (ENV.NODE_ENV === "production") {
    startScheduler();
  }
} catch (err) {
  logger.error("Scheduler start failed", {
    message: err instanceof Error ? err.message : String(err),
  });
}

logger.info(`✅ App initialized in ${ENV.NODE_ENV} mode`);

export default app;