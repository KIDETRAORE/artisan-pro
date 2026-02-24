import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { ENV } from "./config/env";
import { errorHandler } from "./middlewares/error.middleware";
import { globalRateLimit, aiRateLimit } from "./middlewares/rateLimit.middleware";
import { quotaMiddleware } from "./middlewares/quota.middleware";
import { authMiddleware } from "./middlewares/auth.middleware";
import { logger } from "./utils/logger";
import { applySecurity } from "./middlewares/security.middleware";

// Routes
import dashboardRoutes from "./routes/dashboard.routes";
import stripeRoutes from "./routes/stripe.routes";
import stripeWebhookRoutes from "./routes/stripe.webhook";
import automationRoutes from "./routes/automation.routes";
import aiRoutes from "./routes/ai.routes";
import { devisRouter } from "./routes/devis.routes";

const app = express();

/**
 * ======================
 * TRUST PROXY
 * ======================
 * Important pour rate-limit derrière proxy/LB
 */
app.set("trust proxy", 1);

/**
 * ======================
 * SECURITY HEADERS (Helmet + CSP + HSTS prod)
 * ======================
 * Centralisé dans src/middlewares/security.middleware.ts
 */
applySecurity(app);

/**
 * ======================
 * STRIPE WEBHOOK (RAW BODY)
 * DOIT être AVANT express.json()
 * ======================
 */
app.use("/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRoutes);

/**
 * ======================
 * GLOBAL RATE LIMIT
 * ======================
 * (Le webhook Stripe est explicitement exclu via skip() dans rateLimit.middleware.ts)
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

app.use(
  cors({
    origin: (origin, callback) => {
      // autorise calls sans Origin (curl/postman/mobile)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error("CORS not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Préflight global (important pour certains clients)
app.options("*", cors());

/**
 * ======================
 * BODY PARSERS (LIMIT PROTECTION)
 * ======================
 * ⚠️ Le webhook Stripe est en RAW, donc express.json doit venir après
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
 * HEALTH CHECK
 * ======================
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ArtisanPro Backend",
    env: ENV.NODE_ENV,
  });
});

/**
 * ======================
 * API ROUTES
 * ======================
 */
app.use("/dashboard", authMiddleware, dashboardRoutes);
app.use("/stripe", authMiddleware, stripeRoutes); // ✅ recommandé: protège tes endpoints Stripe
app.use("/devis", authMiddleware, devisRouter);

app.use("/ai", authMiddleware, aiRateLimit, quotaMiddleware, aiRoutes);

app.use("/automation", authMiddleware, quotaMiddleware, automationRoutes);

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

logger.info(`✅ App initialized in ${ENV.NODE_ENV} mode`);

export default app;