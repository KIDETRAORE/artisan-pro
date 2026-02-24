// apps/backend/src/routes/compta.routes.ts
import { Router, type Request, type Response } from "express";

import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";

import { aiRateLimit } from "@middlewares/rateLimit.middleware";
import { quotaMiddleware } from "@middlewares/quota.middleware";
import { validate } from "@middlewares/validate.middleware";

import { runAI } from "@services/ai/gemini.service";
import { quotaService } from "@services/quota.service";
import { comptaSchema } from "@validators/compta.schema";

const router = Router();

/**
 * POST /compta/analyze
 * ➜ Analyse comptable IA (cashflow, relances, bilans)
 */
router.post(
  "/analyze",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  aiRateLimit,
  quotaMiddleware,
  validate(comptaSchema),
  async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Non authentifié",
      });
    }

    try {
      // comptaSchema garantit que prompt existe et est valide
      const { prompt } = req.body as { prompt: string };

      const response = await runAI("compta", {
        prompt,
        userId,
      });

      // Enregistrement usage (non bloquant)
      quotaService
        .recordUsage(userId, "compta", prompt, response)
        .catch((err: unknown) => {
          // Ne jamais throw ici
          console.error("[Compta Usage Log Error]", err);
        });

      return res.status(200).json({
        success: true,
        response,
      });
    } catch (err: unknown) {
      console.error("[Compta Error]", err);

      return res.status(500).json({
        success: false,
        error: "Erreur lors de l'analyse comptable",
      });
    }
  }
);

export default router;