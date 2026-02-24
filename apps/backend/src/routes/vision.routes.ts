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
 * POST /api/vision/analyze
 * FREE → 3 analyses / mois
 * PRO → illimité
 */
router.post(
  "/analyze",
  authMiddleware,
  checkQuota,
  validate(visionSchema),
  asyncHandler(analyzeVisionController)
);

/**
 * GET /api/vision/history
 * Accessible aux utilisateurs authentifiés
 */
router.get(
  "/history",
  authMiddleware,
  asyncHandler(getVisionHistoryController)
);

/**
 * GET /api/vision/:id
 */
router.get(
  "/:id",
  authMiddleware,
  asyncHandler(getVisionByIdController)
);

export default router;