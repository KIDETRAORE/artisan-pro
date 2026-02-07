
import { Router } from "express";
import { Buffer } from "node:buffer"; // Added import to fix 'Cannot find name Buffer'
import { authMiddleware } from "../middleware/auth.ts";
import { rateLimiter } from "../middleware/rateLimit.ts";
import { quotaMiddleware } from "../middleware/quota.ts";
import { validatePrompt } from "../middleware/validate.ts";
import { runAI } from "../services/gemini.ts";
import { sanitizeImage } from "../services/imageSanitizer.ts";
import { storeSanitizedImage } from "../services/storageService.ts";
import { quotaService } from "../services/quotaService.ts";

const router = Router();

router.post("/analyze/:userId", authMiddleware, rateLimiter, quotaMiddleware, validatePrompt, async (req: any, res: any) => {
  try {
    const { userId } = req.params;
    
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    const rawImageBase64 = req.body.image;
    const buffer = Buffer.from(rawImageBase64, 'base64');
    const sanitizedBuffer = await sanitizeImage(buffer);
    
    await storeSanitizedImage(userId, "vision", sanitizedBuffer);
    
    const sanitizedBase64 = sanitizedBuffer.toString('base64');
    
    // 1. APPEL IA (L'exécution s'arrête ici en cas d'erreur)
    const aiResponse = await runAI("vision", sanitizedBase64);
    
    // 2. ENREGISTREMENT DE L'USAGE SEULEMENT SI SUCCÈS
    // Poids : 5 crédits. On n'envoie pas le base64 dans les logs pour ne pas saturer la DB.
    await quotaService.recordUsage(userId, "vision", "IMAGE_DATA", JSON.stringify(aiResponse));
    
    res.json({ response: aiResponse });
  } catch (e: any) {
    console.error("[Vision Route Error]:", e);
    // Le quota n'est pas incrémenté ici car recordUsage n'est pas atteint.
    res.status(500).json({ error: "Erreur Analyse Photo", message: e.message });
  }
});

export default router;
