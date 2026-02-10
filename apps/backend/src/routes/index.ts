import { Router } from "express";

// Auth & Core
import authRoutes from "./auth.routes";
import healthRoutes from "./health.routes";
import dashboardRoutes from "./dashboard.routes";

// Features IA
import assistantRoutes from "./assistant.routes";
import comptaRoutes from "./compta.routes";

// Business
import devisRoutes from "./devis.routes";

const router = Router();

/**
 * =========================
 * ROUTES PUBLIQUES
 * =========================
 */
router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

/**
 * =========================
 * ROUTES PROTÉGÉES / MÉTIER
 * =========================
 */
router.use("/dashboard", dashboardRoutes);
router.use("/assistant", assistantRoutes);
router.use("/compta", comptaRoutes);
router.use("/devis", devisRoutes);

export default router;
