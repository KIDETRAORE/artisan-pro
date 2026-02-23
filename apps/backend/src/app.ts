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
 * 👷 WORKERS & QUEUES
 */
import "./workers/reminder.worker";
import "./workers/ai.worker";    

// --- Imports des Routes ---
import dashboardRoutes from "./routes/dashboard.routes";
import stripeRoutes from "./routes/stripe.routes";
import stripeWebhookRoutes from "./routes/stripe.webhook";
import automationRoutes from "./routes/automation.routes"; 
import aiRoutes from "./routes/ai.routes"; 
import { devisRouter } from "./routes/devis.routes";   

const app = express();

app.set("trust proxy", 1);

/**
 * 🔥 STRIPE WEBHOOK (Doit être avant express.json)
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

/**
 * 🛡️ CONFIGURATION CORS
 */
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Augmentation de la limite pour les fichiers (Photos/Audios Base64)
app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

if (ENV.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/**
 * 🔍 HEALTH CHECK
 */
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "Artisan-AI-Backend" });
});

/**
 * API ROUTES
 */

// --- Routes de gestion ---
app.use("/dashboard", authMiddleware, dashboardRoutes);
app.use("/stripe", stripeRoutes);
app.use("/devis", authMiddleware, devisRouter);

// --- MODULE IA CENTRALISÉ ---
// Toutes les fonctionnalités (Vocal, Vision, Compta) passent désormais par /ai
// Le type (vocal/vision/compta) est passé dans le body de la requête
app.use("/ai", authMiddleware, aiRateLimit, quotaMiddleware, aiRoutes);

// --- Automatisation ---
app.use("/automation", authMiddleware, quotaMiddleware, automationRoutes); 

/**
 * 404 & ERROR HANDLER
 */
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route introuvable sur le serveur AI" });
});

app.use(errorHandler);

logger.info(`✅ Application initialisée en mode: ${ENV.NODE_ENV}`);

export default app;