// apps/backend/src/routes/compta.routes.ts
import { Router } from "express";

import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";

import { aiRateLimit } from "@middlewares/rateLimit.middleware";
import { quotaMiddleware } from "@middlewares/quota.middleware";
import { validateStrip } from "@middlewares/validate.middleware";

import { ComptaBodySchema } from "@validators/compta.schema";
import { comptaController } from "@controllers/compta.controller";

const router = Router();

/**
 * POST /compta/analyze
 * ➜ Analyse comptable IA (cashflow, relances, bilans)
 *
 * P1:
 * - pré-check quota avant coût IA (quotaMiddleware)
 * - consommation quota après succès (dans le controller)
 */
router.post(
  "/analyze",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  aiRateLimit,
  quotaMiddleware,
  validateStrip(ComptaBodySchema, "body"),
  comptaController.analyze
);

export default router;