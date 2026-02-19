import { Router } from "express";
import visionRoutes from "./vision.routes";

// Auth & Core
import healthRoutes from "./health.routes";
import dashboardRoutes from "./dashboard.routes";

// Features IA (PHASE 1 stubs)
import assistantRoutes from "./assistant.routes";
import comptaRoutes from "./compta.routes";

// Business
import { devisRouter } from "./devis.routes";

const router = Router();

router.use("/health", healthRoutes);

router.use("/dashboard", dashboardRoutes);
router.use("/assistant", assistantRoutes);
router.use("/compta", comptaRoutes);
router.use("/devis", devisRouter);
router.use("/vision", visionRoutes);

export default router;
