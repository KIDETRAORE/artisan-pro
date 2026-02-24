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
    // ✅ pas de fallback hardcodé
    throw new HttpError(401, "Unauthorized");
  }

  if (!req.file) {
    throw new HttpError(400, "Aucun fichier audio reçu.");
  }

  await validateAudio(req.file.buffer);

  // --- ÉTAPE A : QUOTA (API réelle dispo dans quotaService) ---
  const quota = await quotaService.checkQuota(userId, "vocal");

  if (!quota.allowed) {
    // ✅ log minimal, pas de payload
    logger.warn("Quota bloqué (vocal)", { userId, reason: quota.reason ?? "unknown" });

    return res.status(429).json({
      success: false,
      message: quota.reason || "Quota insuffisant.",
    });
  }

  logger.info("Analyse vocale demandée", { userId });

  // --- ÉTAPE B : IA ---
  // ✅ runAI attend fileBase64, pas audioBuffer
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
    // ✅ ne pas exposer de détails internes
    throw new HttpError(502, "Réponse IA invalide.");
  }

  // --- ÉTAPE C : EXÉCUTION ACTION ---
  let actionResult: any = null;
  if (aiParsed?.action && aiParsed.action !== "NONE") {
    actionResult = await executeAIAction(userId, aiParsed);
  }

  // --- ÉTAPE D : ENREGISTREMENT USAGE ---
  // recordUsage(userId, feature, input?, output?)
  await quotaService.recordUsage(userId, "vocal", "Audio input", aiRawResponse);

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