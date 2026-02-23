import { Router } from "express";
import visionRoutes from "./vision.routes";
import vocalRoutes from "./vocal.routes";
import healthRoutes from "./health.routes";
import dashboardRoutes from "./dashboard.routes";
import assistantRoutes from "./assistant.routes";
import comptaRoutes from "./compta.routes";
import automationRoutes from "./automation.routes";
import { devisRouter } from "./devis.routes";
import aiRoutes from "./ai.routes";

const router = Router();

/**
 * ============================
 * ROUTES TECHNIQUES
 * ============================
 */
router.use("/health", healthRoutes);

/**
 * ============================
 * ROUTES BUSINESS & DASHBOARD
 * ============================
 */
router.use("/dashboard", dashboardRoutes);
router.use("/devis", devisRouter);

/**
 * ============================
 * MODULES IA
 * ============================
 */
router.use("/assistant", assistantRoutes);
router.use("/compta", comptaRoutes);
router.use("/vision", visionRoutes);
router.use("/vocal", vocalRoutes);
router.use("/ai", aiRoutes);

/**
 * ============================
 * AUTOMATISATION (Phase 3)
 * ============================
 */
router.use("/automation", automationRoutes); 

export default router;