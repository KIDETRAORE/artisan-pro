import { Router, Request, Response } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { rateLimiter } from "../middlewares/rateLimit.middleware";
import { quotaMiddleware } from "../middlewares/quota.middleware";
import { validate } from "../middlewares/validate.middleware";
import { runAI } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { promptSchema } from "../validators/prompt.schema";


const router = Router();

/**
 * POST /assistant/ask
 * ➜ Assistant IA général
 * ➜ Auth + rate limit + quota
 */
router.post(
  "/ask",
  authMiddleware,
  rateLimiter,
  quotaMiddleware,
  validate(promptSchema),
  async (req: Request, res: Response) => {
    const user = (req as any).user;

    if (!user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { prompt } = req.body;

      const response = await runAI("assistant", prompt);

      /**
       * Enregistrement de l'usage APRÈS succès
       */
      quotaService
        .recordUsage(user.id, "assistant", prompt, response)
        .catch((err) =>
          console.error("[Assistant Usage Log Error]", err)
        );

      return res.status(200).json({ response });
    } catch (err) {
      console.error("[Assistant Error]", err);
      return res.status(500).json({
        message: "Erreur lors de l'exécution de l'assistant IA",
      });
    }
  }
);

export default router;
