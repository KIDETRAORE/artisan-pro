import { Router, type Request, type Response } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";

import { aiQueue } from "../queues/ai.queue";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { aiRateLimit } from "../middlewares/rateLimit.middleware";
import { validateStrip } from "../middlewares/validate.middleware";

// ✅ (1) Imports ajoutés (et sendError déplacé) — comme demandé
import { quotaService } from "../services/quota.service";
import { FEATURE_WEIGHTS } from "../config/featureWeights";
import { sendError } from "../utils/apiError";

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
      // ✅ FIX: sendError(req,res,status,code,message)
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
      // ✅ FIX: sendError(req,res,status,code,message)
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
        // ✅ FIX
        return sendError(req, res, 401, "unauthorized", "Non authentifié");
      }

      if (!file) {
        logger.warn("[AI-ROUTE] /run missing file");
        // ✅ FIX
        return sendError(req, res, 400, "missing_file", "Aucun fichier reçu");
      }

      // ✅ (2) Pré-check quota (read-only) AVANT aiQueue.add(...)
      const feature = type || "vision";
      const weight = FEATURE_WEIGHTS[feature] ?? 1;

      const quotaCheck = await quotaService.checkQuota(req.user.id, feature);

      if (!quotaCheck.ok) {
        // ✅ FIX: sendError n'accepte PAS un 6e arg "details"
        // On garde la réponse typée standard (code/message). Le détail reste côté logs.
        logger.warn("[AI-ROUTE] quota exceeded (precheck)", {
          userId: req.user.id,
          feature,
          weight,
          quotaCheck,
        });

        return sendError(
          req,
          res,
          403,
          "quota_exceeded",
          "Quota mensuel atteint."
        );
      }

      const fileBase64 = file.buffer.toString("base64");

      const job = await aiQueue.add(
        "ai-task",
        {
          type: feature,
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
      // ✅ FIX
      return sendError(
        req,
        res,
        500,
        "internal_error",
        "Internal Server Error"
      );
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
        // ✅ FIX
        return sendError(req, res, 401, "unauthorized", "Non authentifié");
      }

      // ✅ Pré-check quota (read-only) AVANT enqueue
      const feature = type || "expert";
      const weight = FEATURE_WEIGHTS[feature] ?? 1;

      const quotaCheck = await quotaService.checkQuota(req.user.id, feature);

      if (!quotaCheck.ok) {
        // ✅ FIX: pas de 6e arg details
        logger.warn("[AI-ROUTE] quota exceeded (chat precheck)", {
          userId: req.user.id,
          feature,
          weight,
          quotaCheck,
        });

        return sendError(
          req,
          res,
          403,
          "quota_exceeded",
          "Quota mensuel atteint."
        );
      }

      const job = await aiQueue.add(
        "ai-task",
        {
          type: feature,
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
      // ✅ FIX
      return sendError(
        req,
        res,
        500,
        "internal_error",
        "Internal Server Error"
      );
    }
  }
);

/**
 * ✅ MODIF UNIQUE: normaliser les statuts BullMQ -> statuts API stables
 * - BullMQ: waiting | delayed | active | completed | failed | paused
 * - API: pending | processing | completed | failed
 */
const normalizeJobStatus = (
  state: string
): "pending" | "processing" | "completed" | "failed" => {
  switch (state) {
    case "active":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "waiting":
    case "delayed":
    case "paused":
    default:
      return "pending";
  }
};

/**
 * ===============================
 * GET /ai/status/:jobId
 * - ✅ Normalise l'erreur côté client (pas de fuite failedReason)
 * - ✅ NO-CACHE: éviter 304/ETag qui bloque le polling
 * - ✅ MODIF UNIQUE: status normalisé (pending/processing/completed/failed)
 * ===============================
 */
router.get(
  "/status/:jobId",
  validateStrip(AiStatusParamsSchema, "params"),
  async (req: Request, res: Response) => {
    try {
      // (inchangé) headers anti-cache + ETag variable (évite 304)
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      res.setHeader("ETag", String(Date.now()));

      const requestId = (req as any)?.requestId ?? "unknown";

      const { jobId } = req.params as z.infer<typeof AiStatusParamsSchema>;

      const job = await aiQueue.getJob(String(jobId));
      if (!job) {
        // ✅ FIX
        return sendError(req, res, 404, "not_found", "Analyse introuvable");
      }

      const ownerId = (job.data as any)?.userId as string | undefined;
      if (ownerId && req.user?.id && ownerId !== req.user.id) {
        // ✅ FIX
        return sendError(req, res, 403, "forbidden", "Forbidden");
      }

      const state = await job.getState();
      const status = normalizeJobStatus(state);

      if (state === "failed") {
        logger.warn("[AI-ROUTE] job failed (details kept server-side)", {
          jobId: String(job.id),
          userId: req.user?.id,
          failedReason: (job as any)?.failedReason,
          stacktrace: (job as any)?.stacktrace,
          requestId,
        });
      }

      return res.status(200).json({
        success: true,
        status, // ✅ MODIF UNIQUE: status normalisé (au lieu de "state" BullMQ)
        result: status === "completed" ? job.returnvalue : null,
        error:
          status === "failed"
            ? {
                code: "ai_job_failed",
                message: "L'IA n'a pas pu traiter la demande",
                requestId,
              }
            : null,
      });
    } catch (error: unknown) {
      logger.error("[AI-ROUTE] /status failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      // ✅ FIX
      return sendError(
        req,
        res,
        500,
        "internal_error",
        "Internal Server Error"
      );
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
      // ✅ FIX
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
      // ✅ FIX
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
    // ✅ FIX
    return sendError(
      req,
      res,
      500,
      "internal_error",
      "Internal Server Error"
    );
  }
});

export default router;