// apps/backend/src/routes/vision.routes.ts
import { Router } from "express";
import multer from "multer";

import { authMiddleware } from "@middlewares/auth.middleware";
import { checkQuota } from "@middlewares/checkQuota.middleware";
import { asyncHandler } from "@utils/asyncHandler";

import {
  analyzeVisionController,
  getVisionHistoryController,
  getVisionByIdController,
} from "@controllers/vision.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max (à ajuster)
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);

    if (ok) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
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
  checkQuota,
  upload.single("image"),
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