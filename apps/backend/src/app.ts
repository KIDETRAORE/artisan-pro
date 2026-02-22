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
 * 👷 WORKERS & QUEUES (IMPORTATION POUR ACTIVATION)
 * Indispensable pour que les processus d'arrière-plan écoutent Redis
 */
import "./workers/reminder.worker";
import "./workers/ai.worker";    // 🔥 AJOUTÉ : Pour traiter les tâches IA async
import "./workers/event.worker"; // Corrigé : import depuis /workers si c'est son emplacement

// --- Imports des Routes ---
import dashboardRoutes from "./routes/dashboard.routes";
import visionRoutes from "./routes/vision.routes";
import stripeRoutes from "./routes/stripe.routes";
import stripeWebhookRoutes from "./routes/stripe.webhook";
import vocalRoutes from "./routes/vocal.routes";
import comptaRoutes from "./routes/compta.routes";     
import automationRoutes from "./routes/automation.routes"; 
import assistantRoutes from "./routes/assistant.routes"; 
import aiRoutes from "./routes/ai.routes"; 
import { devisRouter } from "./routes/devis.routes";   

const app = express();

/**
 * CONFIGURATION RÉSEAU
 */
app.set("trust proxy", 1); // Nécessaire pour le Rate Limiting derrière un reverse proxy (Docker/Nginx)

/**
 * 🔥 STRIPE WEBHOOK (Doit être avant express.json())
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
 * 🔍 HEALTH CHECK (PHASE 7 - Pour le Docker Healthcheck)
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ArtisanPro API",
    mode: ENV.NODE_ENV,
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

// Modules IA (Protégés par Auth + Quota + Rate Limit spécifique)
app.use("/vision", aiRateLimit, authMiddleware, quotaMiddleware, visionRoutes);
app.use("/vocal", aiRateLimit, authMiddleware, quotaMiddleware, vocalRoutes);
app.use("/compta", aiRateLimit, authMiddleware, quotaMiddleware, comptaRoutes);
app.use("/assistant", aiRateLimit, authMiddleware, quotaMiddleware, assistantRoutes);
app.use("/ai", aiRateLimit, authMiddleware, quotaMiddleware, aiRoutes);

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

logger.info(`✅ Application initialisée en mode: ${ENV.NODE_ENV}`);

export default app;