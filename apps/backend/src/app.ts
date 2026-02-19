import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { ENV } from "./config/env";
import { errorHandler } from "./middlewares/error.middleware";

import dashboardRoutes from "./routes/dashboard.routes";
import visionRoutes from "./routes/vision.routes";
import stripeRoutes from "./routes/stripe.routes";
import stripeWebhookRoutes from "./routes/stripe.webhook";

const app = express();

app.set("trust proxy", 1);

/**
 * =========================================
 * 🔥 STRIPE WEBHOOK (DOIT ÊTRE EN PREMIER)
 * =========================================
 */
app.use(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

/**
 * =========================================
 * Global Middlewares
 * =========================================
 */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: ENV.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

if (ENV.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

/**
 * =========================================
 * Health check
 * =========================================
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ArtisanPro API",
    timestamp: new Date().toISOString(),
  });
});

/**
 * =========================================
 * API Routes
 * =========================================
 */

app.use("/dashboard", dashboardRoutes);
app.use("/vision", visionRoutes);
app.use("/stripe", stripeRoutes);

/**
 * =========================================
 * 404 Handler
 * =========================================
 */
app.use((_req, res) => {
  res.status(404).json({ error: "Route introuvable" });
});

/**
 * =========================================
 * Global Error Handler
 * =========================================
 */
app.use(errorHandler);

export default app;
