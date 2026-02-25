// apps/backend/src/routes/vision.routes.ts
import { Router } from "express";
import { z } from "zod";

import { authMiddleware } from "@middlewares/auth.middleware";
import { validate } from "@middlewares/validate.middleware";
import { checkQuota } from "@middlewares/checkQuota.middleware";
import { asyncHandler } from "@utils/asyncHandler";

import {
  analyzeVisionController,
  getVisionHistoryController,
  getVisionByIdController,
} from "@controllers/vision.controller";

const router = Router();

const visionSchema = z.object({
  image: z.string().min(20, "Image base64 manquante ou invalide"),
});

/**
 * POST /vision/analyze
 * ✅ Pré-check quota AVANT appel IA (évite coût)
 * - Source de vérité plan/status: subscriptions
 * - Source de vérité quota: ai_quota
 *
 * ⚠️ La consommation réelle du quota doit se faire APRÈS succès dans le controller
 * (via quotaService.recordUsage → RPC consume_ai_quota)
 */
router.post(
  "/analyze",
  authMiddleware,
  checkQuota, // doit checker ai_quota (P1), pas compter vision_analyses
  validate(visionSchema),
  asyncHandler(analyzeVisionController)
);

/**
 * GET /vision/history
 * - Lecture uniquement (pas de quota)
 */
router.get("/history", authMiddleware, asyncHandler(getVisionHistoryController));

/**
 * GET /vision/:id
 * - Lecture uniquement (pas de quota)
 */
router.get("/:id", authMiddleware, asyncHandler(getVisionByIdController));

export default router;