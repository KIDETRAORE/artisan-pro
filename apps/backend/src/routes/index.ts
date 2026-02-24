// apps/backend/src/routes/index.ts
import { Router } from "express";

import healthRoutes from "./health.routes";
import dashboardRoutes from "./dashboard.routes";
import { devisRouter } from "./devis.routes";

import aiRoutes from "./ai.routes";
import assistantRoutes from "./assistant.routes";
import comptaRoutes from "./compta.routes";
import visionRoutes from "./vision.routes";
import vocalRoutes from "./vocal.routes";
import automationRoutes from "./automation.routes";

import { authMiddleware } from "@middlewares/auth.middleware";
import { requireRole } from "@middlewares/requireRole.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";

const router = Router();

/**
 * ============================
 * ROUTES TECHNIQUES (PUBLIC)
 * ============================
 */
router.use("/health", healthRoutes);

/**
 * ============================
 * ROUTES BUSINESS & DASHBOARD (AUTH)
 * ============================
 */
router.use(
  "/dashboard",
  authMiddleware,
  requirePermission(PERMISSIONS.ACCESS_DASHBOARD),
  dashboardRoutes
);

router.use("/devis", authMiddleware, devisRouter);

/**
 * ============================
 * MODULES IA (AUTH + PERMS)
 * ============================
 */
router.use(
  "/ai",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  aiRoutes
);

router.use(
  "/assistant",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  assistantRoutes
);

router.use(
  "/compta",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  comptaRoutes
);

router.use(
  "/vision",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  visionRoutes
);

router.use(
  "/vocal",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  vocalRoutes
);

/**
 * ============================
 * AUTOMATISATION (ADMIN ONLY)
 * ============================
 */
router.use(
  "/automation",
  authMiddleware,
  requireRole("admin"),
  requirePermission(PERMISSIONS.AUTOMATION_USE),
  automationRoutes
);

export default router;