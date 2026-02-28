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
 * MODULES IA
 * ============================
 */

// Guards SANS rate limit (status polling OK)
const aiBaseGuards = [
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  quotaMiddleware,
] as const;

// /ai/* : guards communs (le rate-limit spécifique /run est géré DANS ai.routes.ts)
router.use("/ai", ...aiBaseGuards, aiRoutes);

// Autres modules IA (inchangés, sans aiRateLimit global)
router.use("/assistant", ...aiBaseGuards, assistantRoutes);
router.use("/compta", ...aiBaseGuards, comptaRoutes);
router.use("/vision", ...aiBaseGuards, visionRoutes);
router.use("/vocal", ...aiBaseGuards, vocalRoutes);

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