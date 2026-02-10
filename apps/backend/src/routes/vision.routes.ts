import { Router, Request, Response } from "express";
import { Buffer } from "node:buffer";

import { authMiddleware } from "../middlewares/auth.middleware";
import { rateLimiter } from "../middlewares/rateLimit.middleware";
import { quotaMiddleware } from "../middlewares/quota.middleware";
import { validate } from "../middlewares/validate.middleware";

import { runAI } from "../services/ai/gemini.service";
import { sanitizeImage } from "../services/ai/imageSanitizer";
import { storeSanitizedImage } from "../services/storage.service";
import { quotaService } from "../services/quota.service";

import { z } from "zod";

const router = Router();

/**
 * Schéma de validation du body
 */
const visionSchema = z.object({
  image: z.string().min(10, "Image base64 manquante"),
});

/**
 * POST /vision/analyze
 * Analyse d'une photo de chantier
 */
router.post(
  "/analyze",
  authMiddleware,
  rateLimiter,
  quotaMiddleware,
  validate(visionSchema),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      if (!user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const rawImageBase64 = req.body.image;

      /**
       * 1️⃣ Décodage base64 → Buffer
       */
      const buffer = Buffer.from(rawImageBase64, "base64");

      /**
       * 2️⃣ Sanitation sécurité image
       */
      const sanitizedBuffer = await sanitizeImage(buffer);

      /**
       * 3️⃣ Stockage sécurisé (avant appel IA)
       */
      await storeSanitizedImage(user.id, "vision", sanitizedBuffer);

      /**
       * 4️⃣ Appel IA Vision
       */
      const aiResponse = await runAI(
        "vision",
        sanitizedBuffer.toString("base64")
      );

      /**
       * 5️⃣ Enregistrement usage IA (après succès uniquement)
       */
      await quotaService.recordUsage(
        user.id,
        "vision",
        "IMAGE_DATA",
        JSON.stringify(aiResponse)
      );

      return res.status(200).json({
        response: aiResponse,
      });
    } catch (error: any) {
      console.error("[VisionRoute Error]:", error);

      return res.status(500).json({
        message: "Erreur lors de l'analyse de l'image",
      });
    }
  }
);

export default router;
