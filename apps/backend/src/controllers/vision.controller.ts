import type { Request, Response } from "express";
import { Buffer } from "node:buffer";
import { PROMPTS } from "../services/ai/prompts";
import { sanitizeImage } from "../services/ai/imageSanitizer";
import { runAI } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { extractJSON, validateAnalysis } from "../utils/aiParser";
import { createVisionAnalysis } from "../services/ai/visionAnalysis.service";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { SubscriptionService } from "../services/subscription.service";
import { requireUser } from "../utils/requireUser";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

type VisionAnalyzeBody = {
  image: string; // data:image/...;base64,...
};

/**
 * =====================================
 * Helpers
 * =====================================
 */
function parseDataUriImage(dataUri: string): { mimeType: string; buffer: Buffer } {
  if (!dataUri || typeof dataUri !== "string") {
    throw new HttpError(400, "Image manquante ou invalide");
  }

  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match?.[1] || !match?.[2]) {
    throw new HttpError(400, "Format base64 invalide");
  }

  const mimeType = match[1];

  try {
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) throw new Error("EMPTY_BUFFER");
    return { mimeType, buffer };
  } catch {
    throw new HttpError(400, "Format base64 invalide");
  }
}

/**
 * =====================================
 * POST /vision/analyze
 * (Zod doit valider req.body.image dans la route)
 * =====================================
 */
export async function analyzeVisionController(
  req: Request<{}, {}, VisionAnalyzeBody>,
  res: Response
) {
  const user = requireUser(req);
  const userId = user.id;

  // 🔒 Contrôle abonnement / accès
  await SubscriptionService.checkAccess(userId);

  const { mimeType, buffer } = parseDataUriImage(req.body.image);

  const sanitizedBuffer = await sanitizeImage(buffer);

  // ✅ runAI attend fileBase64 (pas image: Buffer)
  const fileBase64 = sanitizedBuffer.toString("base64");

  const aiText = await runAI("vision", {
    prompt: PROMPTS.vision,
    fileBase64,
    mimeType,
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

  // 🔹 Incrémentation usage (après succès uniquement)
  await SubscriptionService.incrementUsage(userId);

  // 🔹 Quota legacy (non bloquant)
  try {
    await quotaService.recordUsage(userId, "vision", "image-analysis", JSON.stringify(analysis));
  } catch (err) {
    logger.warn("Quota usage non enregistré (vision)", {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });
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

  if (error) throw error;

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
    return res.status(404).json({ message: "Analyse non trouvée" });
  }

  return res.status(200).json(data);
}