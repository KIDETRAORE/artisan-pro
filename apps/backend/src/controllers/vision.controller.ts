import { Request, Response } from "express";
import { Buffer } from "node:buffer";
import { PROMPTS } from "../services/ai/prompts";
import { sanitizeImage } from "../services/ai/imageSanitizer";
import { runAI } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { extractJSON, validateAnalysis } from "../utils/aiParser";
import { createVisionAnalysis } from "../services/ai/visionAnalysis.service";
import { supabaseAdmin } from "../lib/supabaseAdmin";

/**
 * =====================================
 * Helpers
 * =====================================
 */

function base64ImageToBuffer(dataUri: string): Buffer {
  if (!dataUri || typeof dataUri !== "string") {
    throw new Error("INVALID_IMAGE_INPUT");
  }

  // Format attendu : data:image/jpeg;base64,XXXXX
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
  res: Response
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rawBase64 = req.body.image as string;

    if (!rawBase64) {
      return res.status(400).json({ message: "Image manquante" });
    }

    let buffer: Buffer;

    try {
      buffer = base64ImageToBuffer(rawBase64);
    } catch (err) {
      return res.status(400).json({ message: "Base64 invalide" });
    }

    const sanitizedBuffer = await sanitizeImage(buffer);

    const prompt = PROMPTS.vision;

    const aiText = await runAI("vision", {
      prompt,
      image: sanitizedBuffer,
    });

    let analysis;

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

    // 🔹 Sauvegarde Supabase
    const savedAnalysis = await createVisionAnalysis({
      userId: req.user.id,
      analysis,
      confidence: analysis.confidence,
      originalSize: buffer.length,
      sanitizedSize: sanitizedBuffer.length,
    });

    // 🔹 Quota (non bloquant)
    try {
      await quotaService.recordUsage(
        req.user.id,
        "vision",
        "image-analysis",
        JSON.stringify(analysis)
      );
    } catch (err) {
      console.warn("Quota non enregistré", err);
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
    return res.status(502).json({
      message: "AI analysis failed",
      error: error.message,
    });
  }
}

/**
 * =====================================
 * GET /vision/history
 * =====================================
 */
export async function getVisionHistoryController(
  req: Request,
  res: Response
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { data, error } = await supabaseAdmin
      .from("vision_analyses")
      .select("id, confidence, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json(data);

  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * =====================================
 * GET /vision/:id
 * =====================================
 */
export async function getVisionByIdController(
  req: Request,
  res: Response
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("vision_analyses")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: "Analyse non trouvée" });
    }

    return res.json(data);

  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}
