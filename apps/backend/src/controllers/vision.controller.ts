import { Request, Response, NextFunction } from "express";
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

/**
 * =====================================
 * Helpers
 * =====================================
 */

function base64ImageToBuffer(dataUri: string): Buffer {
  if (!dataUri || typeof dataUri !== "string") {
    throw new Error("INVALID_IMAGE_INPUT");
  }

  const match = dataUri.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);

  if (!match || !match[1]) {
    throw new Error("INVALID_BASE64_IMAGE_FORMAT");
  }

  return Buffer.from(match[1], "base64");
}

/**
 * =====================================
 * POST /vision/analyze
 * =====================================
 */
export async function analyzeVisionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = requireUser(req);
    const userId = user.id;

    // 🔒 Sécurité SaaS (FREE limit)
    await SubscriptionService.checkAccess(userId);

    const rawBase64 = req.body.image as string;

    if (!rawBase64) {
      return res.status(400).json({ message: "Image manquante" });
    }

    let buffer: Buffer;

    try {
      buffer = base64ImageToBuffer(rawBase64);
    } catch {
      return res.status(400).json({ message: "Base64 invalide" });
    }

    const sanitizedBuffer = await sanitizeImage(buffer);

    const aiText = await runAI("vision", {
      prompt: PROMPTS.vision,
      image: sanitizedBuffer,
    });

    let analysis: any;

    try {
      const jsonString = extractJSON(aiText);
      analysis = JSON.parse(jsonString);
    } catch {
      return res.status(400).json({ message: "AI_INVALID_JSON" });
    }

    try {
      analysis = validateAnalysis(analysis);
    } catch {
      return res.status(400).json({ message: "AI_SCHEMA_INVALID" });
    }

    // 🔹 Sauvegarde en base
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
      await quotaService.recordUsage(
        userId,
        "vision",
        "image-analysis",
        JSON.stringify(analysis)
      );
    } catch (err) {
      console.warn("Quota non enregistré:", err);
    }

    return res.status(200).json({
      analysis: savedAnalysis,
      metadata: {
        originalSize: buffer.length,
        sanitizedSize: sanitizedBuffer.length,
      },
    });

  } catch (error: any) {
    console.error("VISION ERROR:", error);

    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return next(error);
  }
}

/**
 * =====================================
 * GET /vision/history
 * =====================================
 */
export async function getVisionHistoryController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = requireUser(req);

    const { data, error } = await supabaseAdmin
      .from("vision_analyses")
      .select("id, confidence, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json(data);

  } catch (error) {
    next(error);
  }
}

/**
 * =====================================
 * GET /vision/:id
 * =====================================
 */
export async function getVisionByIdController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = requireUser(req);
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("vision_analyses")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        message: "Analyse non trouvée",
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    next(error);
  }
}
