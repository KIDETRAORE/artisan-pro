// apps/backend/src/controllers/compta.controller.ts
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { runAI } from "@services/ai/gemini.service";
import { quotaService } from "@services/quota.service";
import { logger } from "@utils/logger";
import { HttpError } from "@utils/httpError";
import { sendError } from "@utils/apiError";

import { ComptaBodySchema } from "@validators/compta.schema";
import { incrementMonthlyAnalyses } from "../services/userUsage.service";

type AuthedRequest = Request & {
  user?: { id?: string };
};

export const comptaController = {
  async analyze(req: Request, res: Response, next: NextFunction) {
    try {
      const r = req as AuthedRequest;
      const userId = r.user?.id;

      if (!userId) {
        throw new HttpError(401, "Non authentifié");
      }

      // ✅ body déjà validé par validateStrip(ComptaBodySchema, "body")
      const { prompt } = req.body as z.infer<typeof ComptaBodySchema>;

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

      await incrementMonthlyAnalyses(req.user!.id, 1);

      return res.status(200).json({
        success: true,
        response,
      });
    } catch (e) {
      // ✅ On laisse le middleware global gérer (HttpError, ZodError, fallback)
      // mais on garde une compat locale pour respecter le format d'erreur unifié si besoin.
      if (e instanceof HttpError) {
        return sendError(req, res, e.statusCode, "http_error", e.message);
      }

      logger.error("Compta: erreur analyse", {
        userId: (req as AuthedRequest).user?.id,
        message: e instanceof Error ? e.message : String(e),
      });

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