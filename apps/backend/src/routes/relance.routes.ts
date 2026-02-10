import { Router, Request, Response } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { rateLimiter } from "../middlewares/rateLimit.middleware";
import { quotaMiddleware } from "../middlewares/quota.middleware";
import { validate } from "../middlewares/validate.middleware";
import { runAI } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";

const router = Router();

/**
 * POST /relance/generate
 * Génération d'un message de relance client
 */
router.post(
  "/generate",
  authMiddleware,
  rateLimiter,
  quotaMiddleware,
  validate(
    // validation simple du prompt
    // tu peux affiner plus tard avec un vrai schema métier
    {
      parse: (data: any) => {
        if (!data?.prompt || typeof data.prompt !== "string") {
          throw new Error("Prompt invalide");
        }
        return data;
      },
    } as any
  ),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { prompt } = req.body;

      if (!user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const response = await runAI("relance", prompt);

      // 📊 Enregistrement de l'usage après succès
      await quotaService
        .recordUsage(user.id, "relance", prompt, response)
        .catch((e) => console.error("[Relance Usage Log Error]:", e));

      return res.status(200).json({ response });
    } catch (error: any) {
      console.error("[Relance Route Error]:", error);
      return res.status(500).json({
        message: "Erreur lors de la génération de la relance",
      });
    }
  }
);

export default router;
