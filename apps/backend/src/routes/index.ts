// apps/backend/src/routes/index.ts
import { Router } from "express";

import healthRoutes from "./health.routes";
import dashboardRoutes from "./dashboard.routes";
import { devisRouter } from "./devis.routes";
import stripeRoutes from "./stripe.routes";

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

import { aiRateLimit } from "@middlewares/rateLimit.middleware";
import { quotaMiddleware } from "@middlewares/quota.middleware";

const router = Router();

/**
 * ============================
 * ROUTES TECHNIQUES (PUBLIC)
 * ============================
 */
router.use("/health", healthRoutes);

/**
 * ============================
 * STRIPE (AUTH)
 * ⚠️ /stripe/webhook reste dans app.ts (raw body)
 * ============================
 */
router.use("/stripe", authMiddleware, stripeRoutes);

/**
 * ============================
 * ROUTES BUSINESS (AUTH)
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
 * MODULES IA (AUTH + PERMS + RATE LIMIT + QUOTA)
 * ============================
 */
const aiGuards = [
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  aiRateLimit,
  quotaMiddleware,
] as const;

router.use("/ai", ...aiGuards, aiRoutes);
router.use("/assistant", ...aiGuards, assistantRoutes);
router.use("/compta", ...aiGuards, comptaRoutes);
router.use("/vision", ...aiGuards, visionRoutes);
router.use("/vocal", ...aiGuards, vocalRoutes);

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
  quotaMiddleware,
  automationRoutes
);

export default router;