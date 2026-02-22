import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { ENV } from "./config/env";
import { errorHandler } from "./middlewares/error.middleware";
import { globalRateLimit, aiRateLimit } from "./middlewares/rateLimit.middleware";
import { quotaMiddleware } from "./middlewares/quota.middleware"; 
import { authMiddleware } from "./middlewares/auth.middleware"; 
import { logger } from "./utils/logger";

/**
 * 👷 WORKER & QUEUE
 * L'import du worker lance l'écoute des jobs Redis au démarrage.
 */
import "./workers/reminder.worker";
import "./events/event.worker";

// --- Imports des Routes ---
import dashboardRoutes from "./routes/dashboard.routes";
import visionRoutes from "./routes/vision.routes";
import stripeRoutes from "./routes/stripe.routes";
import stripeWebhookRoutes from "./routes/stripe.webhook";
import vocalRoutes from "./routes/vocal.routes";
import comptaRoutes from "./routes/compta.routes";     
import automationRoutes from "./routes/automation.routes"; 
import assistantRoutes from "./routes/assistant.routes"; 
import { devisRouter } from "./routes/devis.routes";   

const app = express();

app.set("trust proxy", 1);

/**
 * 🔥 STRIPE WEBHOOK (AVANT LE JSON PARSER)
 * Doit impérativement rester avant express.json()
 */
app.use(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

/**
 * GLOBAL MIDDLEWARES
 */
app.use(globalRateLimit);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: ENV.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

if (ENV.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/**
 * HEALTH CHECK
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ArtisanPro API",
    timestamp: new Date().toISOString(),
  });
});

/**
 * API ROUTES
 */

// Routes Business & Stripe
app.use("/dashboard", dashboardRoutes);
app.use("/stripe", stripeRoutes);
app.use("/devis", devisRouter);

// Modules IA (Protégés par Auth + Quota)
app.use("/vision", aiRateLimit, authMiddleware, quotaMiddleware, visionRoutes);
app.use("/vocal", aiRateLimit, authMiddleware, quotaMiddleware, vocalRoutes);
app.use("/compta", aiRateLimit, authMiddleware, quotaMiddleware, comptaRoutes);
app.use("/assistant", aiRateLimit, authMiddleware, quotaMiddleware, assistantRoutes);

// Automatisation & Relances
app.use("/automation", authMiddleware, quotaMiddleware, automationRoutes); 

/**
 * 404 HANDLER
 */
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route introuvable" });
});

/**
 * GLOBAL ERROR HANDLER
 */
app.use(errorHandler);

logger.info(`Application initialisée en mode: ${ENV.NODE_ENV}`);

export default app;