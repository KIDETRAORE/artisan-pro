// apps/backend/src/routes/ai.routes.ts
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { aiQueue } from "../queues/ai.queue";
import { logger } from "../utils/logger";

import { getAiForecast, getAiStrategy } from "../controllers/ai.controller";

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
 *
 * ✅ Auth/Perm/RateLimit/Quota sont déjà appliqués dans routes/index.ts sur "/ai"
 */
router.post("/run", upload.single("file"), async (req: Request, res: Response) => {
  logger.info("[AI-ROUTE] /run request received");

  try {
    const { type } = req.body as { type?: string };
    const file = req.file;

    // req.user doit être injecté par authMiddleware (au niveau routes/index.ts)
    if (!req.user?.id) {
      logger.warn("[AI-ROUTE] /run unauthorized (missing req.user.id)");
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    if (!file) {
      logger.warn("[AI-ROUTE] /run missing file");
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

    logger.info("[AI-ROUTE] /run job created", {
      jobId: job.id,
      userId: req.user.id,
    });

    return res.status(200).json({ success: true, jobId: job.id });
  } catch (error: unknown) {
    logger.error("[AI-ROUTE] /run failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /ai/status/:jobId
 * Récupère le statut et le résultat du job
 */
router.get("/status/:jobId", async (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);

    if (!jobId || jobId === "undefined") {
      return res.status(400).json({ success: false, error: "ID de job invalide" });
    }

    const job = await aiQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ success: false, error: "Analyse introuvable" });
    }

    // ✅ Sécurité : vérifier ownership
    const ownerId = (job.data as any)?.userId as string | undefined;
    if (ownerId && req.user?.id && ownerId !== req.user.id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const state = await job.getState();

    return res.status(200).json({
      success: true,
      status: state,
      result: state === "completed" ? job.returnvalue : null,
      error: state === "failed" ? job.failedReason : null,
    });
  } catch (error: unknown) {
    logger.error("[AI-ROUTE] /status failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /ai/strategy
 */
router.get("/strategy", (req: Request, res: Response) => getAiStrategy(req, res));

/**
 * GET /ai/forecast
 */
router.get("/forecast", (req: Request, res: Response) => getAiForecast(req, res));

export default router;