import { Router, Request, Response } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { rateLimiter } from "../middlewares/rateLimit.middleware";
import { quotaMiddleware } from "../middlewares/quota.middleware";
import { validate } from "../middlewares/validate.middleware";
import { runAI } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { comptaSchema } from "../validators/compta.schema";

const router = Router();

/**
 * POST /compta/analyze
 * ➜ Analyse comptable IA
 * ➜ Fonctionnalité coûteuse (quota + rate limit)
 */
router.post(
  "/analyze",
  authMiddleware,
  rateLimiter,
  quotaMiddleware,
  validate(comptaSchema),
  async (req: Request, res: Response) => {
    const user = (req as any).user;

    if (!user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const input = req.body;

      const response = await runAI("compta", input);

      /**
       * Enregistrement de l'usage APRÈS succès
       * ➜ analyse comptable = feature coûteuse
       */
      quotaService
        .recordUsage(
          user.id,
          "compta",
          JSON.stringify(input),
          JSON.stringify(response)
        )
        .catch((err) =>
          console.error("[Compta Usage Log Error]", err)
        );

      return res.status(200).json({ response });
    } catch (err) {
      console.error("[Compta Error]", err);
      return res.status(500).json({
        message: "Erreur lors de l'analyse comptable",
      });
    }
  }
);

export default router;
