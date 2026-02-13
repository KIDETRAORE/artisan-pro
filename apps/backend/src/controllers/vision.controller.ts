import { Request, Response } from "express";
import { Buffer } from "node:buffer";
import { sanitizeImage } from "../services/ai/imageSanitizer";
import { analyzeImageWithVision } from "../services/ai/vision.service";
import { quotaService } from "../services/quota.service";

export async function analyzeVisionController(
  req: Request,
  res: Response
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rawBase64 = req.body.image as string;

    let buffer: Buffer;

    try {
      buffer = Buffer.from(rawBase64, "base64");
    } catch {
      return res.status(400).json({ message: "Base64 invalide" });
    }

    console.log("🧼 sanitizeImage START");

    const sanitizedBuffer = await sanitizeImage(buffer);

    console.log("🧠 Vision AI START");

    const analysis = await analyzeImageWithVision(sanitizedBuffer);

    console.log("✅ Vision AI SUCCESS");

    try {
      await quotaService.recordUsage(
        req.user.id,
        "vision",
        "image-analysis",
        JSON.stringify(analysis)
      );
    } catch {
      console.warn("⚠ Quota non enregistré (non bloquant)");
    }

    return res.status(200).json({
      analysis,
      metadata: {
        originalSize: buffer.length,
        sanitizedSize: sanitizedBuffer.length,
      },
    });

  } catch (error: unknown) {
    console.error("🔥 VISION ERROR:", error);

    return res.status(502).json({
      message: "AI analysis failed",
      error:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });
  }
}
