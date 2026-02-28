import { Router, type Request, type Response } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";

import { aiQueue } from "../queues/ai.queue";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { sendError } from "../utils/apiError";
import { aiRateLimit } from "../middlewares/rateLimit.middleware";
import { validateStrip } from "../middlewares/validate.middleware";

const router = Router();

/**
 * ===============================
 * Validation (Zod)
 * ===============================
 */
const AiRunBodySchema = z.object({
  type: z.string().min(1).max(40).optional(),
});

const AiChatBodySchema = z.object({
  type: z.string().min(1).max(40).optional(),
  prompt: z.string().min(1, "Prompt manquant").max(10_000),
  context: z.unknown().optional(),
});

const AiStatusParamsSchema = z.object({
  jobId: z
    .string()
    .min(1)
    .refine((v) => v !== "undefined", "ID de job invalide"),
});

/**
 * ===============================
 * Multer memory storage
 * ===============================
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

/**
 * Upload middleware
 */
const uploadMiddleware = (
  req: Request,
  res: Response,
  next: (err?: unknown) => void
) => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      return sendError(
        req,
        res,
        413,
        "file_too_large",
        "Fichier trop volumineux (max 15MB)."
      );
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
    const ext = fileName.includes(".")
      ? fileName.split(".").pop()?.toLowerCase()
      : undefined;
    const isXlsx = ext === "xlsx";

    const detectedMime = detected?.mime ?? null;
    const isAllowed =
      (detectedMime !== null && allowedMimes.includes(detectedMime)) ||
      (detectedMime === "application/zip" && isXlsx);

    if (!isAllowed) {
      return sendError(
        req,
        res,
        415,
        "unsupported_media_type",
        "Type de fichier non supporté."
      );
    }

    return next();
  });
};

/**
 * ===============================
 * POST /ai/run
 * - Rate limit UNIQUEMENT ici
 * ===============================
 */
router.post(
  "/run",
  aiRateLimit,
  uploadMiddleware,
  validateStrip(AiRunBodySchema, "body"),
  async (req: Request, res: Response) => {
    logger.info("[AI-ROUTE] /run request received");

    try {
      const { type } = req.body as z.infer<typeof AiRunBodySchema>;
      const file = req.file;

      if (!req.user?.id) {
        logger.warn("[AI-ROUTE] /run unauthorized (missing req.user.id)");
        return sendError(req, res, 401, "unauthorized", "Non authentifié");
      }

      if (!file) {
        logger.warn("[AI-ROUTE] /run missing file");
        return sendError(req, res, 400, "missing_file", "Aucun fichier reçu");
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
      return sendError(req, res, 500, "internal_error", "Internal Server Error");
    }
  }
);

/**
 * ===============================
 * POST /ai/chat
 * ===============================
 */
router.post(
  "/chat",
  validateStrip(AiChatBodySchema, "body"),
  async (req: Request, res: Response) => {
    logger.info("[AI-ROUTE] /chat request received");

    try {
      const { type, prompt, context } =
        req.body as z.infer<typeof AiChatBodySchema>;

      if (!req.user?.id) {
        logger.warn("[AI-ROUTE] /chat unauthorized (missing req.user.id)");
        return sendError(req, res, 401, "unauthorized", "Non authentifié");
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
      return sendError(req, res, 500, "internal_error", "Internal Server Error");
    }
  }
);

/**
 * ===============================
 * GET /ai/status/:jobId
 * - ✅ Normalise l'erreur côté client (pas de fuite failedReason)
 * ===============================
 */
router.get(
  "/status/:jobId",
  validateStrip(AiStatusParamsSchema, "params"),
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params as z.infer<typeof AiStatusParamsSchema>;

      const job = await aiQueue.getJob(String(jobId));
      if (!job) {
        return sendError(req, res, 404, "not_found", "Analyse introuvable");
      }

      const ownerId = (job.data as any)?.userId as string | undefined;
      if (ownerId && req.user?.id && ownerId !== req.user.id) {
        return sendError(req, res, 403, "forbidden", "Forbidden");
      }

      const state = await job.getState();

      // ✅ Si failed : garder le détail côté serveur uniquement
      if (state === "failed") {
        logger.warn("[AI-ROUTE] job failed (details kept server-side)", {
          jobId: String(job.id),
          userId: req.user?.id,
          failedReason: (job as any)?.failedReason,
          stacktrace: (job as any)?.stacktrace,
          requestId: (req as any)?.requestId,
        });
      }

      return res.status(200).json({
        success: true,
        status: state,
        result: state === "completed" ? job.returnvalue : null,
        error:
          state === "failed"
            ? {
                code: "ai_job_failed",
                message: "L'IA n'a pas pu traiter la demande",
                requestId: (req as any)?.requestId ?? undefined,
              }
            : null,
      });
    } catch (error: unknown) {
      logger.error("[AI-ROUTE] /status failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return sendError(req, res, 500, "internal_error", "Internal Server Error");
    }
  }
);

/**
 * ✅ NOUVELLE ROUTE
 * GET /ai/compta/latest
 */
router.get("/compta/latest", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return sendError(req, res, 401, "unauthorized", "Non authentifié");
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
      return sendError(req, res, 500, "db_error", "DB error");
    }

    const row = data?.[0];

    return res.status(200).json({
      success: true,
      report: row?.response_json ?? null,
      createdAt: row?.created_at ?? null,
      id: row?.id ?? null,
    });
  } catch {
    return sendError(req, res, 500, "internal_error", "Internal Server Error");
  }
});

export default router;