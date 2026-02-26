import type { Request, Response } from "express";
import { Buffer } from "node:buffer";
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

  // ⚠️ Le pré-check quota est idéalement fait dans la route via middleware.
  // Si tu veux un pré-check "defense-in-depth", décommente :
  // const check = await quotaService.checkQuota(userId, "vision");
  // if (!check.allowed) throw new HttpError(403, check.reason || "Quota insuffisant");

  const { mimeType, buffer } = parseDataUriImage(req.body.image);

  // ✅ limite max buffer (après décodage base64)
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
  if (buffer.length > MAX_IMAGE_BYTES) {
    return res.status(413).json({
      success: false,
      error: "Image trop volumineuse (max 5MB).",
    });
  }

  // ✅ check MIME réel via file-type (ne pas faire confiance au data URI)
  const detected = await fileTypeFromBuffer(buffer);
  const allowedMimes = ["image/jpeg", "image/png", "image/webp"];

  if (!detected || !allowedMimes.includes(detected.mime)) {
    return res.status(415).json({
      success: false,
      error: "Type d'image non supporté.",
    });
  }

  const sanitizedBuffer = await sanitizeImage(buffer);

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

  /**
   * ✅ Consommation quota APRÈS succès (source de vérité = ai_quota via quotaService)
   * IMPORTANT: ce call doit être BLOQUANT (sinon IA consommée sans être comptée)
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

    // Si le quota est dépassé au moment de consommer (race condition),
    // on renvoie une erreur claire.
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
    return res.status(404).json({ message: "Analyse non trouvée" });
  }

  return res.status(200).json(data);
}