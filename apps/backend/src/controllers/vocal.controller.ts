import type { Request, Response } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

import { validateAudio } from "../utils/fileValidation";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { runAI } from "../services/ai/gemini.service";
import { executeAIAction } from "../services/ai/action.executor";
import { quotaService } from "../services/quota.service";

/**
 * ======================
 * MULTER CONFIG (AUDIO)
 * ======================
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

/**
 * ======================
 * UPLOAD MIDDLEWARE
 * - Validation MIME réelle (file-type)
 * - Erreurs HTTP claires
 * ======================
 */
export const uploadMiddleware = (
  req: Request,
  res: Response,
  next: (err?: unknown) => void
) => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      return res.status(413).json({
        success: false,
        error: {
          code: "payload_too_large",
          message: "Fichier trop volumineux (max 10MB).",
        },
      });
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return next();
    }

    const detected = await fileTypeFromBuffer(file.buffer);
    const allowedMimes = [
      "audio/mpeg", // mp3
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
    ];

    if (!detected || !allowedMimes.includes(detected.mime)) {
      return res.status(415).json({
        success: false,
        error: {
          code: "unsupported_media_type",
          message: "Format audio non supporté.",
        },
      });
    }

    return next();
  });
};

type AuthedRequest = Request & {
  user?: { id?: string };
};

export async function handleAudioUpload(req: Request, res: Response) {
  const r = req as AuthedRequest;

  const userId = r.user?.id;
  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  if (!req.file) {
    throw new HttpError(400, "Aucun fichier audio reçu.");
  }

  await validateAudio(req.file.buffer);

  logger.info("Analyse vocale demandée", { userId });

  /**
   * ======================
   * ÉTAPE B : IA
   * ======================
   */
  const fileBase64 = req.file.buffer.toString("base64");

  const aiRawResponse = await runAI("vocal", {
    prompt: "Analyse ce message et extrais l'action si nécessaire.",
    fileBase64,
    mimeType: req.file.mimetype,
    userId,
  });

  let aiParsed: any;
  try {
    aiParsed = JSON.parse(aiRawResponse);
  } catch {
    throw new HttpError(502, "Réponse IA invalide.");
  }

  /**
   * ======================
   * ÉTAPE C : EXÉCUTION ACTION
   * ======================
   */
  let actionResult: any = null;
  if (aiParsed?.action && aiParsed.action !== "NONE") {
    actionResult = await executeAIAction(userId, aiParsed);
  }

  /**
   * ======================
   * ÉTAPE D : CONSOMMATION QUOTA (APRÈS SUCCÈS)
   * ======================
   */
  try {
    await quotaService.recordUsage(userId, "vocal", "Audio input", aiRawResponse);
  } catch (err: unknown) {
    logger.error("❌ Quota recordUsage failed (vocal)", {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });

    throw new HttpError(403, "Quota mensuel IA dépassé. Passez au plan PRO.");
  }

  const currentQuota = await quotaService.getUserQuota(userId);

  return res.status(200).json({
    success: true,
    data: {
      answer: aiParsed?.answer ?? null,
      action: aiParsed?.action ?? "NONE",
      details: actionResult,
      usage: currentQuota,
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
      },
    },
  });
}