import { Router } from "express";
import { z } from "zod";

import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { analyzeVisionController } from "../controllers/vision.controller";

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
 * POST /api/vision/analyze
 * ==============================
 */
router.post(
  "/analyze",
  authMiddleware,
  validate(visionSchema),
  analyzeVisionController
);

export default router;
