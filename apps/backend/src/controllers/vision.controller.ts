// apps/backend/src/controllers/vision.controller.ts
import type { Request, Response } from "express";
import { fileTypeFromBuffer } from "file-type";

import { PROMPTS } from "../services/ai/prompts";
import { sanitizeImage } from "../services/ai/imageSanitizer";
import { runAI } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { extractJSON, validateAnalysis } from "../utils/aiParser";
import { createVisionAnalysis } from "../services/ai/visionAnalysis.service";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireUser } from "../utils/requireUser";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

/**
 * =====================================
 * POST /vision/analyze (multipart/form-data)
 * =====================================
 */
export async function analyzeVisionController(
  req: Request,
  res: Response
) {
  const user = requireUser(req);
  const userId = user.id;

  // multer met le fichier dans req.file
  const file = (req as any).file as Express.Multer.File | undefined;

  if (!file?.buffer?.length) {
    throw new HttpError(400, "Image manquante (champ 'image')");
  }

  const buffer = file.buffer;

  // ✅ limite max buffer (binaire direct)
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "Image trop volumineuse (max 5MB).");
  }

  // ✅ check MIME réel via file-type (ne pas faire confiance au client)
  const detected = await fileTypeFromBuffer(buffer);
  const allowedMimes = ["image/jpeg", "image/png", "image/webp"];

  if (!detected || !allowedMimes.includes(detected.mime)) {
    throw new HttpError(415, "Type d'image non supporté.");
  }

  const sanitizedBuffer = await sanitizeImage(buffer);

  const fileBase64 = sanitizedBuffer.toString("base64");

  const aiText = await runAI("vision", {
    prompt: PROMPTS.vision,
    fileBase64,
    mimeType: detected.mime,
    userId,
  });

  let analysis: any;
  try {
    const jsonString = extractJSON(aiText);
    analysis = JSON.parse(jsonString);
  } catch {
    throw new HttpError(502, "Réponse IA invalide");
  }

  try {
    analysis = validateAnalysis(analysis);
  } catch {
    throw new HttpError(502, "Réponse IA invalide");
  }

  const savedAnalysis = await createVisionAnalysis({
    userId,
    analysis,
    confidence: analysis.confidence,
    originalSize: buffer.length,
    sanitizedSize: sanitizedBuffer.length,
  });

  /**
   * ✅ Consommation quota APRÈS succès
   */
  try {
    await quotaService.recordUsage(
      userId,
      "vision",
      "image-analysis",
      JSON.stringify(analysis)
    );
  } catch (err: unknown) {
    logger.error("❌ Quota recordUsage failed (vision)", {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });

    throw new HttpError(403, "Quota mensuel IA dépassé. Passez au plan PRO.");
  }

  return res.status(200).json({
    analysis: savedAnalysis,
    metadata: {
      originalSize: buffer.length,
      sanitizedSize: sanitizedBuffer.length,
    },
  });
}

/**
 * =====================================
 * GET /vision/history
 * =====================================
 */
export async function getVisionHistoryController(req: Request, res: Response) {
  const user = requireUser(req);

  const { data, error } = await supabaseAdmin
    .from("vision_analyses")
    .select("id, confidence, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "Erreur lors du chargement de l'historique");
  }

  return res.status(200).json(data);
}

/**
 * =====================================
 * GET /vision/:id
 * =====================================
 */
export async function getVisionByIdController(req: Request, res: Response) {
  const user = requireUser(req);
  const { id } = req.params;

  if (!id) {
    throw new HttpError(400, "Paramètre id manquant");
  }

  const { data, error } = await supabaseAdmin
    .from("vision_analyses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return res.status(404).json({
      success: false,
      error: {
        code: "not_found",
        message: "Analyse non trouvée",
      },
    });
  }

  return res.status(200).json(data);
}