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
import { logger } from "@utils/logger";

const router = Router();

/**
 * POST /compta/analyze
 * ➜ Analyse comptable IA (cashflow, relances, bilans)
 *
 * P1:
 * - pré-check quota avant coût IA (quotaMiddleware)
 * - consommation quota après succès (await quotaService.recordUsage)
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
      const { prompt } = req.body as { prompt: string };

      const response = await runAI("compta", {
        prompt,
        userId,
      });

      // ✅ Consommation quota APRÈS succès (bloquant)
      try {
        await quotaService.recordUsage(userId, "compta", prompt, response);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);

        logger.warn("Compta: quota recordUsage failed", { userId, message: msg });

        // Race condition / quota dépassé au moment de consommer
        if (msg.includes("quota_exceeded") || msg.includes("Quota")) {
          return res.status(403).json({
            success: false,
            error: "Quota mensuel IA dépassé. Passez au plan PRO.",
          });
        }

        // RPC down / erreur interne quota
        return res.status(500).json({
          success: false,
          error: "Erreur interne (quota)",
        });
      }

      return res.status(200).json({
        success: true,
        response,
      });
    } catch (err: unknown) {
      logger.error("Compta: erreur analyse", {
        userId,
        message: err instanceof Error ? err.message : String(err),
      });

      return res.status(500).json({
        success: false,
        error: "Erreur lors de l'analyse comptable",
      });
    }
  }
);

export default router;