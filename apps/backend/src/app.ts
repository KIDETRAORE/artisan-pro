// apps/backend/src/app.ts
import express from "express";
import cors, { type CorsOptions } from "cors";
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
 * TRUST PROXY
 */
app.set("trust proxy", 1);

/**
 * SECURITY HEADERS
 */
applySecurity(app);

/**
 * STRIPE WEBHOOK (RAW BODY)
 */
app.use(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

/**
 * GLOBAL RATE LIMIT
 */
app.use(globalRateLimit);

/**
 * CORS
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
 * BODY PARSERS
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

/**
 * DEV LOGGER
 */
if (ENV.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/**
 * HEALTH CHECK
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ArtisanPro Backend",
    env: ENV.NODE_ENV,
  });
});

/**
 * API ROUTES
 */
app.use("/dashboard", authMiddleware, dashboardRoutes);
app.use("/stripe", authMiddleware, stripeRoutes);
app.use("/devis", authMiddleware, devisRouter);

app.use("/ai", authMiddleware, aiRateLimit, quotaMiddleware, aiRoutes);
app.use("/automation", authMiddleware, quotaMiddleware, automationRoutes);

/**
 * 404
 */
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

/**
 * ERROR HANDLER
 */
app.use(errorHandler);

logger.info(`✅ App initialized in ${ENV.NODE_ENV} mode`);

export default app;