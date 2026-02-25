import type { Request, Response } from "express";
import multer from "multer";

import { validateAudio } from "../utils/fileValidation";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { runAI } from "../services/ai/gemini.service";
import { executeAIAction } from "../services/ai/action.executor";
import { quotaService } from "../services/quota.service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadMiddleware = upload.single("file");

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

  /**
   * ======================
   * ÉTAPE A : PRÉ-CHECK QUOTA (évite coût IA)
   * ======================
   */
  const quotaCheck = await quotaService.checkQuota(userId, "vocal");

  if (!quotaCheck.allowed) {
    logger.warn("Quota bloqué (vocal)", {
      userId,
      reason: quotaCheck.reason ?? "unknown",
    });

    return res.status(403).json({
      success: false,
      message: quotaCheck.reason || "Quota insuffisant. Passez au plan PRO.",
    });
  }

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
   * - Doit être BLOQUANT (sinon IA consommée sans être comptée)
   * ======================
   */
  try {
    await quotaService.recordUsage(userId, "vocal", "Audio input", aiRawResponse);
  } catch (err: unknown) {
    logger.error("❌ Quota recordUsage failed (vocal)", {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });

    // Cas possible: race condition (2 requêtes en parallèle) → quota dépassé au moment de consommer
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