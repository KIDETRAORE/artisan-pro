// apps/backend/src/routes/ai.routes.ts
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { aiQueue } from "../queues/ai.queue";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin"; // ✅ AJOUTÉ

const router = Router();

/**
 * Multer memory storage
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

/**
 * Upload middleware
 */
const uploadMiddleware = (req: Request, res: Response, next: (err?: unknown) => void) => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      return res.status(413).json({
        success: false,
        error: "Fichier trop volumineux (max 15MB).",
      });
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return next();
    }

    const detected = await fileTypeFromBuffer(file.buffer);

    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    const fileName = file.originalname ?? "";
    const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;
    const isXlsx = ext === "xlsx";

    const detectedMime = detected?.mime ?? null;
    const isAllowed =
      (detectedMime !== null && allowedMimes.includes(detectedMime)) ||
      (detectedMime === "application/zip" && isXlsx);

    if (!isAllowed) {
      return res.status(415).json({
        success: false,
        error: "Type de fichier non supporté.",
      });
    }

    return next();
  });
};

/**
 * POST /ai/run
 */
router.post("/run", uploadMiddleware, async (req: Request, res: Response) => {
  logger.info("[AI-ROUTE] /run request received");

  try {
    const { type } = req.body as { type?: string };
    const file = req.file;

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
        removeOnComplete: { age: 600, count: 50 },
        removeOnFail: { age: 3600 },
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
 * POST /ai/chat
 */
router.post("/chat", async (req: Request, res: Response) => {
  logger.info("[AI-ROUTE] /chat request received");

  try {
    const { type, prompt, context } = req.body as {
      type?: string;
      prompt?: string;
      context?: unknown;
    };

    if (!req.user?.id) {
      logger.warn("[AI-ROUTE] /chat unauthorized (missing req.user.id)");
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      logger.warn("[AI-ROUTE] /chat missing prompt");
      return res.status(400).json({ success: false, error: "Prompt manquant" });
    }

    const job = await aiQueue.add(
      "ai-task",
      {
        type: type || "expert",
        userId: req.user.id,
        prompt,
        context,
      },
      {
        removeOnComplete: { age: 600, count: 50 },
        removeOnFail: { age: 3600 },
      }
    );

    logger.info("[AI-ROUTE] /chat job created", {
      jobId: job.id,
      userId: req.user.id,
    });

    return res.status(200).json({ success: true, jobId: job.id });
  } catch (error: unknown) {
    logger.error("[AI-ROUTE] /chat failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /ai/status/:jobId
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
 * ✅ NOUVELLE ROUTE
 * GET /ai/compta/latest
 */
router.get("/compta/latest", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const { data, error } = await supabaseAdmin
      .from("ai_logs")
      .select("id, feature, status, response_json, created_at")
      .eq("user_id", req.user.id)
      .eq("feature", "compta")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return res.status(500).json({ success: false, error: "DB error" });
    }

    const row = data?.[0];

    return res.status(200).json({
      success: true,
      report: row?.response_json ?? null,
      createdAt: row?.created_at ?? null,
      id: row?.id ?? null,
    });
  } catch {
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
});

export default router;