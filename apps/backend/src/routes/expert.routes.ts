// apps/backend/src/routes/expert.routes.ts
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { aiQueue } from "../queues/ai.queue";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { sendError } from "../utils/apiError";
import { validateStrip } from "../middlewares/validate.middleware";

import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";
import { quotaMiddleware } from "@middlewares/quota.middleware";

import {
  appendMessage,
  getLastMessages,
  getOrCreateConversationId,
} from "../services/expertConversation.service";

const router = Router();

const HISTORY_N = 8;

const ExpertChatBodySchema = z.object({
  analysisId: z.string().min(1, "analysisId manquant"),
  prompt: z.string().min(1, "Prompt manquant").max(10_000),
});

const ExpertHistoryQuerySchema = z.object({
  analysisId: z.string().min(1, "analysisId manquant"),
});

function buildExpertContext(report: any) {
  if (!report || typeof report !== "object") return null;

  return {
    meta: report?.meta ?? undefined,
    totals: report?.totals ?? undefined,
    tva: report?.tva ?? undefined,
    breakdown: report?.breakdown
      ? {
          parMois: Array.isArray(report.breakdown.parMois)
            ? report.breakdown.parMois.slice(0, 12)
            : [],
          topRecettes: Array.isArray(report.breakdown.topRecettes)
            ? report.breakdown.topRecettes.slice(0, 10)
            : [],
          topDepenses: Array.isArray(report.breakdown.topDepenses)
            ? report.breakdown.topDepenses.slice(0, 10)
            : [],
        }
      : undefined,
    anomalies: Array.isArray(report?.anomalies)
      ? report.anomalies.slice(0, 20)
      : undefined,
    summary: report?.summary
      ? {
          resume: report.summary.resume,
          actions: Array.isArray(report.summary.actions)
            ? report.summary.actions.slice(0, 10)
            : [],
          questions: Array.isArray(report.summary.questions)
            ? report.summary.questions.slice(0, 10)
            : [],
        }
      : undefined,
  };
}

function interpretShortIntent(prompt: string): string {
  const p = prompt.trim().toLowerCase();

  if (p === "tva" || p.includes("tva") || p.includes("taxe")) {
    return "Optimise la TVA à partir du rapport comptable (diagnostic + 2 actions + 1 vérification + 1 prochaine étape).";
  }
  if (
    p === "charges" ||
    p === "charge" ||
    p.includes("charge") ||
    p.includes("dépense") ||
    p.includes("depense") ||
    p.includes("coût") ||
    p.includes("cout")
  ) {
    return "Optimise les charges à partir du rapport comptable (top postes + 2 actions + 1 vérification + 1 prochaine étape).";
  }
  if (p === "marge" || p.includes("marge") || p.includes("rentab")) {
    return "Optimise la marge à partir du rapport comptable (constats + 2 actions + 1 vérification + 1 prochaine étape).";
  }
  if (
    p === "trésorerie" ||
    p === "tresorerie" ||
    p.includes("cash") ||
    p.includes("liquid")
  ) {
    return "Optimise la trésorerie à partir du rapport comptable (risques + 2 actions + 1 vérification + 1 prochaine étape).";
  }

  return prompt;
}

/**
 * ✅ MODIFS UNIQUES (B):
 * - template ultra “copiable”
 * - 8 lignes max
 * - obligation de recopier TVA_A_PAYER / TVA_COLLECTEE / TVA_DEDUCTIBLE
 * - si markdown détecté => réécrire immédiatement en texte brut (sinon invalide)
 */
function buildSystemInstruction(): string {
  return [
    "Tu es l’Expert Comptable ArtisanPro.",
    "Tu réponds en français, simple et actionnable.",
    "Base-toi sur CONTEXTE (rapport) + HISTORIQUE.",

    "RÈGLE TVA (OBLIGATOIRE) :",
    "- Tu dois recopier EXACTEMENT les montants TVA_A_PAYER / TVA_COLLECTEE / TVA_DEDUCTIBLE depuis OFFICIAL_FIGURES.",
    "- Interdit de recalculer la TVA (ni somme, ni arrondis).",

    "ANTI-MARKDOWN (OBLIGATOIRE) :",
    "- Tu réponds en TEXTE BRUT uniquement.",
    "- Si tu as écrit le moindre Markdown (###, **, `, listes Markdown, etc.), tu dois RÉÉCRIRE IMMÉDIATEMENT la réponse SANS Markdown. Sinon réponse invalide.",

    "FORMAT STRICT :",
    "- 8 lignes MAX au total (y compris les questions).",
    "- 1 idée par ligne. Phrases courtes.",
    "- Interdit : ###, **, ``, { }, [], JSON, ou code.",
    "- Copie EXACTEMENT le template ci-dessous (mêmes lignes, même ordre).",

    "TEMPLATE (copie exactement, 8 lignes max) :",
    "🧾 TVA (résumé)",
    "• À payer : TVA_A_PAYER €",
    "• Collectée : TVA_COLLECTEE € | Déductible : TVA_DEDUCTIBLE €",
    "✅ Actions",
    "1) ...",
    "2) ...",
    "⚠️ À vérifier : ...",
    "❓ Question : ...",
  ].join("\n");
}

router.get(
  "/history",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  validateStrip(ExpertHistoryQuerySchema, "query"),
  async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) {
        return sendError(req, res, 401, "unauthorized", "Non authentifié");
      }

      const { analysisId } =
        req.query as z.infer<typeof ExpertHistoryQuerySchema>;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("expert_conversations")
        .select("id")
        .eq("user_id", req.user.id)
        .eq("analysis_id", analysisId)
        .maybeSingle();

      if (convErr) {
        return sendError(req, res, 500, "history_fetch_failed", convErr.message);
      }

      if (!conv?.id) {
        return res.status(200).json({ success: true, messages: [] });
      }

      const { data: msgs, error: msgErr } = await supabaseAdmin
        .from("expert_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });

      if (msgErr) {
        return sendError(req, res, 500, "history_fetch_failed", msgErr.message);
      }

      const messages = (Array.isArray(msgs) ? msgs : []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      }));

      return res.status(200).json({ success: true, messages });
    } catch (error: unknown) {
      return sendError(
        req,
        res,
        500,
        "internal_error",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);

router.post(
  "/chat",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  quotaMiddleware,
  validateStrip(ExpertChatBodySchema, "body"),
  async (req: Request, res: Response) => {
    logger.info("[EXPERT-ROUTE] /chat request received");

    try {
      if (!req.user?.id) {
        return sendError(req, res, 401, "unauthorized", "Non authentifié");
      }

      const { analysisId, prompt } =
        req.body as z.infer<typeof ExpertChatBodySchema>;

      const { data, error } = await supabaseAdmin
        .from("ai_logs")
        .select("id, feature, status, response_json")
        .eq("id", analysisId)
        .eq("user_id", req.user.id)
        .single();

      if (error || !data) {
        return sendError(
          req,
          res,
          404,
          "analysis_not_found",
          "Analyse introuvable"
        );
      }

      if (data.feature !== "compta" || data.status !== "completed") {
        return sendError(
          req,
          res,
          400,
          "analysis_not_ready",
          "Analyse non disponible (pas compta ou pas terminée)."
        );
      }

      const conversationId = await getOrCreateConversationId({
        userId: req.user.id,
        analysisId: String(data.id),
      });

      await appendMessage({
        conversationId,
        role: "user",
        content: prompt,
      });

      const history = await getLastMessages({
        conversationId,
        limit: HISTORY_N,
      });

      const reportContext = buildExpertContext(data.response_json);
      const interpreted = interpretShortIntent(prompt);

      // ✅ MODIF UNIQUE (C): support a_payer OU aPayer
      const tva = (reportContext as any)?.tva ?? undefined;

      const tvaAPayer =
        typeof tva?.a_payer === "number"
          ? tva.a_payer
          : typeof tva?.aPayer === "number"
            ? tva.aPayer
            : null;

      const tvaCollectee =
        typeof tva?.collectee === "number" ? tva.collectee : null;

      const tvaDeductible =
        typeof tva?.deductible === "number" ? tva.deductible : null;

      const officialFigures = [
        "OFFICIAL_FIGURES (SOURCE DE VÉRITÉ — À COPIER TEL QUEL) :",
        `TVA_A_PAYER = ${tvaAPayer ?? "null"}`,
        `TVA_COLLECTEE = ${tvaCollectee ?? "null"}`,
        `TVA_DEDUCTIBLE = ${tvaDeductible ?? "null"}`,
        "INSTRUCTION: Tu dois COPIER ces montants tels quels dans le template (aucun recalcul).",
      ].join("\n");

      const finalPrompt = `${buildSystemInstruction()}

${officialFigures}

QUESTION UTILISATEUR:
${interpreted}`;

      const jobContext = {
        analysisId: String(data.id),
        conversationId,
        report: reportContext,
        history,
      };

      const job = await aiQueue.add(
        "ai-task",
        {
          type: "expert",
          userId: req.user.id,
          prompt: finalPrompt,
          context: jobContext,
          conversationId,
          analysisId: String(data.id),
        },
        {
          removeOnComplete: { age: 600, count: 50 },
          removeOnFail: { age: 3600 },
        }
      );

      return res.status(200).json({
        success: true,
        jobId: job.id,
        conversationId,
      });
    } catch (error: unknown) {
      logger.error("[EXPERT-ROUTE] /chat failed", {
        message: error instanceof Error ? error.message : String(error),
      });

      return sendError(
        req,
        res,
        500,
        "internal_error",
        "Internal Server Error"
      );
    }
  }
);

export default router;