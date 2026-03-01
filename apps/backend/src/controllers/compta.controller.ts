// apps/backend/src/controllers/compta.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";

import { runAI } from "@services/ai/gemini.service";
import { quotaService } from "@services/quota.service";
import { logger } from "@utils/logger";
import { HttpError } from "@utils/httpError";
import { sendError } from "@utils/apiError";
import { validateStrip } from "@middlewares/validate.middleware";

type AuthedRequest = Request & {
  user?: { id?: string };
};

// ✅ Zod schema (obligatoire)
const ComptaBodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
});

export const comptaController = {
  async analyze(req: Request, res: Response) {
    const r = req as AuthedRequest;
    const userId = r.user?.id;

    if (!userId) {
      throw new HttpError(401, "Non authentifié");
    }

    // ✅ Données validées uniquement
    const parsed = ComptaBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(req, res, 400, "validation_error", "Payload invalide", {
        issues: parsed.error.issues,
      });
    }

    const { prompt } = parsed.data;

    try {
      // ======================
      // ÉTAPE A : IA
      // ======================
      const response = await runAI("compta", {
        prompt,
        userId,
      });

      // ======================
      // ÉTAPE B : CONSOMMATION QUOTA (post-success)
      // ======================
      try {
        await quotaService.recordUsage(userId, "compta", prompt, response);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);

        logger.warn("Compta: quota recordUsage failed", {
          userId,
          message: msg,
        });

        if (msg.includes("quota_exceeded") || msg.includes("Quota")) {
          throw new HttpError(
            403,
            "Quota mensuel IA dépassé. Passez au plan PRO."
          );
        }

        throw new HttpError(500, "Erreur interne (quota)");
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

      if (err instanceof HttpError) {
        return sendError(req, res, err.statusCode, "http_error", err.message);
      }

      return sendError(
        req,
        res,
        500,
        "compta_analysis_failed",
        "Erreur lors de l'analyse comptable"
      );
    }
  },
};