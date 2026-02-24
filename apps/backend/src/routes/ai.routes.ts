// apps/backend/src/routes/ai.routes.ts
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { aiQueue } from "../queues/ai.queue";
import { logger } from "../utils/logger";

import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";

const router = Router();

/**
 * Multer memory storage
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

/**
 * POST /ai/run
 * Lance une tâche IA via BullMQ
 */
router.post(
  "/run",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  upload.single("file"),
  async (req: Request, res: Response) => {
    logger.info("📩 [AI-ROUTE] Requête reçue sur /run");

    try {
      const { type } = req.body as { type?: string };
      const file = req.file;

      if (!req.user?.id) {
        logger.warn("❌ [AI-ROUTE] Utilisateur non authentifié");
        return res.status(401).json({ success: false, error: "Non authentifié" });
      }

      if (!file) {
        logger.warn("⚠️ [AI-ROUTE] Aucun fichier dans la requête");
        return res.status(400).json({ success: false, error: "Aucun fichier reçu" });
      }

      const fileBase64 = file.buffer.toString("base64");

      const job = await aiQueue.add(
        "ai-task",
        {
          type: type || "vision",
          userId: req.user.id,
          fileBase64,
          mimeType: file.mimetype,
          fileName: file.originalname,
        },
        {
          removeOnComplete: { age: 600, count: 50 }, // 10 min / 50 jobs
          removeOnFail: { age: 3600 }, // 1h
        }
      );

      logger.info("✅ [AI-ROUTE] Job créé", { jobId: job.id, userId: req.user.id });

      return res.status(200).json({
        success: true,
        jobId: job.id,
      });
    } catch (error: unknown) {
      logger.error("💥 [AI-ROUTE] Erreur /run", { error });
      return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  }
);

/**
 * GET /ai/status/:jobId
 * Récupère le statut et le résultat du job
 */
router.get(
  "/status/:jobId",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  async (req: Request, res: Response) => {
    try {
      const jobId = String(req.params.jobId);

      if (!jobId || jobId === "undefined") {
        return res.status(400).json({ success: false, error: "ID de job invalide" });
      }

      const job = await aiQueue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ success: false, error: "Analyse introuvable" });
      }

      // ⚠️ Option sécurité (recommandée) :
      // vérifier que le job appartient au user courant (si tu stockes userId dans job.data)
      // const ownerId = (job.data as any)?.userId;
      // if (ownerId && req.user?.id && ownerId !== req.user.id) return res.status(403).json({ success:false, error:"Forbidden" });

      const state = await job.getState();

      return res.status(200).json({
        success: true,
        status: state,
        result: state === "completed" ? job.returnvalue : null,
        error: state === "failed" ? job.failedReason : null,
      });
    } catch (error: unknown) {
      logger.error("💥 [AI-ROUTE] Erreur /status", { error });
      return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  }
);

export default router;