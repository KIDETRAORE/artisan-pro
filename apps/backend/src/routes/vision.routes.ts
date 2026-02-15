import { Router } from "express";
import { z } from "zod";

import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  analyzeVisionController,
  getVisionHistoryController,
  getVisionByIdController,
} from "../controllers/vision.controller";

const router = Router();

/**
 * ==============================
 * ZOD SCHEMA
 * ==============================
 */
const visionSchema = z.object({
  image: z.string().min(20, "Image base64 manquante ou invalide"),
});

/**
 * ==============================
 * POST /vision/analyze
 * ==============================
 */
router.post(
  "/analyze",
  authMiddleware,
  validate(visionSchema),
  analyzeVisionController
);

/**
 * ==============================
 * GET /vision/history
 * ==============================
 */
router.get(
  "/history",
  authMiddleware,
  getVisionHistoryController
);

/**
 * ==============================
 * GET /vision/:id
 * ==============================
 */
router.get(
  "/:id",
  authMiddleware,
  getVisionByIdController
);

export default router;
