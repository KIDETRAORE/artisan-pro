import { Request, Response } from "express";
import multer from "multer";
import { validateAudio } from "../utils/fileValidation";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { runAI } from "../services/ai/gemini.service";
import { executeAIAction } from "../services/ai/action.executor";
// ON IMPORTE L'OBJET quotaService
import { quotaService } from "../services/quota.service"; 

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadMiddleware = upload.single("file");

export async function handleAudioUpload(req: Request, res: Response) {
  const userId = (req as any).user?.id || "0296267b-e3c8-45f4-b1b3-f4a9a5a7144e"; 

  if (!req.file) {
    throw new HttpError(400, "Aucun fichier audio reçu.");
  }

  await validateAudio(req.file.buffer);

  try {
    // --- ÉTAPE A : VÉRIFICATION QUOTA (Via ton service existant) ---
    const quota = await quotaService.checkAndLockQuota(userId, "vocal");
    
    if (!quota.allowed) {
      logger.warn(`🚫 [QUOTA BLOQUÉ] User: ${userId} - Raison: ${quota.reason}`);
      return res.status(429).json({
        success: false,
        message: quota.reason || "Quota insuffisant."
      });
    }

    logger.info(`Analyse vocale demandée par ${userId}`);

    // --- ÉTAPE B : TRAITEMENT IA ---
    const aiRawResponse = await runAI("vocal", {
      prompt: "Analyse ce message et extrais l'action si nécessaire.",
      audioBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      userId: userId
    });

    let aiParsed;
    try {
      aiParsed = JSON.parse(aiRawResponse);
    } catch (parseError) {
      throw new HttpError(500, "L'IA a répondu dans un format invalide.");
    }

    // --- ÉTAPE C : EXÉCUTION SQL ---
    let actionResult = null;
    if (aiParsed.action && aiParsed.action !== "NONE") {
      actionResult = await executeAIAction(userId, aiParsed);
    }

    // --- ÉTAPE D : ENREGISTREMENT DE L'USAGE ---
    await quotaService.recordUsage(userId, "vocal", "Audio input", aiRawResponse);

    // Récupération du quota à jour pour l'affichage
    const currentQuota = await quotaService.getUserQuota(userId);

    res.status(200).json({
      success: true,
      data: {
        answer: aiParsed.answer,
        action: aiParsed.action,
        details: actionResult,
        usage: currentQuota,
        fileInfo: {
          name: req.file.originalname,
          size: req.file.size
        }
      }
    });

  } catch (error: any) {
    logger.error("Erreur Controller Vocal", { message: error.message, userId });
    if (error instanceof HttpError) throw error;
    res.status(500).json({ success: false, message: error.message || "Erreur interne" });
  }
}