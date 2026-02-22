import { Router, Request, Response } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
// Correction ici : on utilise le nom exact exporté par ton fichier middleware
import { aiRateLimit } from "../middlewares/rateLimit.middleware"; 
import { quotaMiddleware } from "../middlewares/quota.middleware";
import { validate } from "../middlewares/validate.middleware";
import { runAI } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { comptaSchema } from "../validators/compta.schema";

const router = Router();

/**
 * POST /compta/analyze
 * ➜ Analyse comptable IA (Cashflow, relances, bilans)
 */
router.post(
  "/analyze",
  authMiddleware,
  aiRateLimit, // Utilisation du bon nom corrigé
  quotaMiddleware,
  validate(comptaSchema),
  async (req: Request, res: Response) => {
    // On récupère l'ID de l'utilisateur (soit de l'auth, soit de ton test)
    const userId = (req as any).user?.id || "0296267b-e3c8-45f4-b1b3-f4a9a5a7144e";

    try {
      /**
       * ✅ On récupère le prompt validé
       */
      const { prompt } = req.body;

      /**
       * ✅ Appel de runAI corrigé
       * Ajout du userId obligatoire pour le contexte et les logs
       */
      const response = await runAI("compta", {
        prompt,
        userId: userId // Argument manquant rajouté
      });

      /**
       * ✅ Enregistrement usage après succès
       */
      quotaService
        .recordUsage(
          userId,
          "compta",
          prompt,
          response
        )
        .catch((err) =>
          console.error("[Compta Usage Log Error]", err)
        );

      return res.status(200).json({ 
        success: true,
        response 
      });

    } catch (err: any) {
      console.error("[Compta Error]", err);
      return res.status(500).json({
        success: false,
        message: "Erreur lors de l'analyse comptable",
        error: err.message
      });
    }
  }
);

export default router;