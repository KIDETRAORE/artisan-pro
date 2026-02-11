import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { ENV } from "./config/env";
import { errorHandler } from "./middlewares/error.middleware";

import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes";

const app = express();

/**
 * ======================
 * Trust proxy
 * (important si derrière Nginx / Railway / Vercel)
 * ======================
 */
app.set("trust proxy", 1);

/**
 * ======================
 * Global middlewares
 * ======================
 */

// Sécurité HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: false, // nécessaire pour images / uploads
  })
);

// CORS (cookies + auth)
app.use(
  cors({
    origin: ENV.CORS_ORIGIN, // ✅ correction ici
    credentials: true,
  })
);

// Parsing JSON (limite anti-abus)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// Cookies (JWT refresh httpOnly)
app.use(cookieParser());

// Logs HTTP
if (ENV.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

/**
 * ======================
 * Health check
 * ======================
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ArtisanPro API",
    timestamp: new Date().toISOString(),
  });
});

/**
 * ======================
 * API Routes
 * ======================
 */
app.use("/auth", authRoutes);
app.use("/dashboard", dashboardRoutes);

/**
 * ======================
 * 404 fallback
 * ======================
 */
app.use((_req, res) => {
  res.status(404).json({ error: "Route introuvable" });
});

/**
 * ======================
 * Error handler
 * (TOUJOURS EN DERNIER)
 * ======================
 */
app.use(errorHandler);

export default app;
