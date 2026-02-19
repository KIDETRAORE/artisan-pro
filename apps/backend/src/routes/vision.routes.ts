import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "@middlewares/auth.middleware";
import { validate } from "@middlewares/validate.middleware";
import { checkQuota } from "@middlewares/checkQuota.middleware";
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
  checkQuota,               // 🔥 ajout SaaS ici
  validate(visionSchema),
  analyzeVisionController
);

/**
 * GET /api/vision/history
 * Accessible aux utilisateurs authentifiés
 */
router.get(
  "/history",
  authMiddleware,
  getVisionHistoryController
);

/**
 * GET /api/vision/:id
 */
router.get(
  "/:id",
  authMiddleware,
  getVisionByIdController
);

export default router;
