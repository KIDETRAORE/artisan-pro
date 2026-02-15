import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { ENV } from "./config/env";
import { errorHandler } from "./middlewares/error.middleware";

import dashboardRoutes from "./routes/dashboard.routes";
import visionRoutes from "./routes/vision.routes";

const app = express();

app.use((req, _res, next) => {
  console.log("➡️ INCOMING", req.method, req.url, req.headers["content-type"]);
  next();
});


/**
 * ======================
 * Trust proxy
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
    crossOriginResourcePolicy: false, // requis pour images / uploads
  })
);

// CORS
app.use(
  cors({
    origin: ENV.CORS_ORIGIN,
    credentials: true,
  })
);

// ⚠️ IMPORTANT : taille augmentée pour base64 image
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

// Cookies (refresh token)
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
app.use("/dashboard", dashboardRoutes);
app.use("/vision", visionRoutes); // ✅ ROUTE VISION OK

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
 * Error handler (TOUJOURS EN DERNIER)
 * ======================
 */
app.use(errorHandler);

export default app;
