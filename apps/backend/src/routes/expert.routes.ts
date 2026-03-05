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

// ✅ MODIF UNIQUE: analysisId optionnel + uuid
const ExpertHistoryQuerySchema = z.object({
  analysisId: z.string().uuid().optional(),
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

  // ✅ MODIF UNIQUE: intents larges => synthèse globale (pas juste TVA)
  if (
    p === "synthese" ||
    p === "synthèse" ||
    p.includes("synthese") ||
    p.includes("synthèse") ||
    p === "analyse" ||
    p.includes("analyse") ||
    p === "compta" ||
    p.includes("compta")
  ) {
    return [
      "Fais une synthèse complète de la situation comptable de l'artisan.",
      "Explique les recettes, les charges, la rentabilité et la TVA en utilisant uniquement les données du rapport.",
      "Signale les anomalies si présentes, et propose 1 à 3 pistes d'amélioration actionnables.",
      "Termine par une question pour continuer la discussion.",
    ].join(" ");
  }

  if (p === "tva" || p.includes("tva") || p.includes("taxe")) {
    return "Explique la situation TVA à partir du rapport (TVA à payer, collectée, déductible), ce que ça signifie, et une action concrète à faire. Termine par une question.";
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
    return "Analyse les charges à partir du rapport (postes principaux, ce qui pèse le plus), explique simplement, propose 1 à 3 actions pour optimiser. Termine par une question.";
  }

  if (p === "marge" || p.includes("marge") || p.includes("rentab")) {
    return "Analyse la marge / rentabilité à partir du rapport, explique ce que les chiffres indiquent, propose 1 à 3 actions concrètes pour améliorer. Termine par une question.";
  }

  if (
    p === "trésorerie" ||
    p === "tresorerie" ||
    p.includes("cash") ||
    p.includes("liquid")
  ) {
    return "Analyse la trésorerie à partir du rapport (risques, points d’attention), explique simplement, propose 1 à 3 actions concrètes. Termine par une question.";
  }

  return prompt;
}

/**
 * ✅ MODIF UNIQUE (remplacement complet)
 * Prompt conversationnel (sans template fixe)
 * + règle: si question large => analyser l'ensemble du rapport
 *
 * ✅ AJOUT (demandé): bloc DIAGNOSTIC INTELLIGENT + règle "tenir compte de l'historique"
 * ✅ AJOUT (demandé): FORMAT DE RÉPONSE OBLIGATOIRE (anti JSON / anti markdown)
 * ✅ AJOUT (demandé): arrondir les montants à l'euro
 * ✅ MODIF (demandé): renforcer anti-markdown + anti-json
 */
function buildSystemInstruction(): string {
  return [
    "Tu es ExpertComptableGPT pour l'application ArtisanPro.",
    "Tu aides des artisans du bâtiment à comprendre leur comptabilité et améliorer leur rentabilité.",
    "Tu analyses un rapport comptable fourni dans CONTEXTE.",
    "Objectif : expliquer les chiffres simplement et aider l'utilisateur à prendre de meilleures décisions.",

    "Règles :",
    "• N'invente jamais de chiffres",
    "• Utilise uniquement les données du rapport",
    "• Explique les résultats simplement",
    "• Réponds comme un expert-comptable humain",

    // ✅ AJOUT UNIQUE : arrondir les montants
    "RÈGLE D'AFFICHAGE DES MONTANTS (OBLIGATOIRE) :",
    "• Tous les montants doivent être arrondis à l'euro pour être plus lisibles.",
    "• Exemple : 5 946 € au lieu de 5 946,99 €.",

    // ✅ MODIF UNIQUE : anti-markdown + anti-json plus dur
    "RÈGLES DE FORMAT (OBLIGATOIRE)",
    "- Réponds uniquement en TEXTE BRUT.",
    '- Interdits : JSON, { }, [ ], guillemets de clé ("response":), code, Markdown.',
    "- Interdits : **, __, ##, ###, ``` , liens [texte](url), listes Markdown.",
    "- Si tu as écrit un seul caractère de Markdown (ex: **), tu dois réécrire immédiatement la réponse en texte brut.",
    '- Utilise uniquement : emojis + texte + puces simples "•" + numéros "1)".',

    "Style :",
    "- Français simple",
    "- Ton pédagogique",
    "- Réponse conversationnelle",
    "- Maximum 8 à 10 lignes",

    "Structure recommandée :",
    "1. Synthèse rapide",
    "2. Interprétation des chiffres",
    "3. Conseils concrets (1 à 3)",
    "4. Question pour continuer la discussion",

    "IMPORTANT :",
    "Si la question utilisateur est courte (ex : TVA, marge, charges, synthèse) :",
    "• analyse le rapport",
    "• explique la situation",
    "• propose une piste d'amélioration",
    "• pose une question pour approfondir",

    "HISTORIQUE (IMPORTANT) :",
    "Tu dois tenir compte de l'historique de la conversation (HISTORIQUE) pour éviter de répéter les mêmes informations.",
    "Si un point a déjà été expliqué, fais un rappel très court et avance (nouvelle analyse / nouveau conseil / nouvelle question).",

    "DIAGNOSTIC INTELLIGENT :",
    "Ton rôle n'est pas seulement de répondre mais d'aider l'artisan à comprendre sa situation.",
    "Quand une information manque pour faire une analyse fiable :",
    "• pose une question pertinente",
    "• adapte ton analyse selon la réponse",
    "• fais avancer la discussion",
    "Un bon expert pose souvent des questions avant de conclure.",
    "Limite les questions à une seule à la fois.",

    'Si la question utilisateur est large (ex: "synthèse", "analyse", "compta"), tu dois analyser l\'ensemble du rapport et pas seulement un élément spécifique comme la TVA.',
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

      // ✅ MODIF UNIQUE: fallback dernière conversation si analysisId absent
      let conversationId: string | null = null;

      if (analysisId) {
        const { data: conv, error: convErr } = await supabaseAdmin
          .from("expert_conversations")
          .select("id")
          .eq("user_id", req.user.id)
          .eq("analysis_id", analysisId)
          .maybeSingle();

        if (convErr) {
          return sendError(
            req,
            res,
            500,
            "history_fetch_failed",
            convErr.message
          );
        }

        conversationId = conv?.id ?? null;
      }

      if (!conversationId) {
        const { data: conv, error: convErr } = await supabaseAdmin
          .from("expert_conversations")
          .select("id")
          .eq("user_id", req.user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (convErr) {
          return sendError(
            req,
            res,
            500,
            "history_fetch_failed",
            convErr.message
          );
        }

        conversationId = conv?.id ?? null;
      }

      if (!conversationId) {
        return res.status(200).json({ success: true, messages: [] });
      }

      const { data: msgs, error: msgErr } = await supabaseAdmin
        .from("expert_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (msgErr) {
        return sendError(req, res, 500, "history_fetch_failed", msgErr.message);
      }

      // ✅ MODIF UNIQUE: renvoyer exactement { id, role, content, createdAt }
      const messages = (Array.isArray(msgs) ? msgs : []).map((m: any) => ({
        id: String(m.id ?? ""),
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content ?? ""),
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

      const analysisIdTrimmed = String(analysisId ?? "").trim();

      const { data, error } = await supabaseAdmin
        .from("ai_logs")
        .select("id, feature, status, response_json")
        .eq("id", analysisIdTrimmed)
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

      const conversationIdTrimmed = String(conversationId ?? "").trim();
      if (!conversationIdTrimmed) {
        return sendError(
          req,
          res,
          500,
          "conversation_init_failed",
          "Impossible d'initialiser la conversation."
        );
      }

      await appendMessage({
        conversationId: conversationIdTrimmed,
        role: "user",
        content: prompt,
      });

      const history = await getLastMessages({
        conversationId: conversationIdTrimmed,
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
      ].join("\n");

      const finalPrompt = `${buildSystemInstruction()}

${officialFigures}

QUESTION UTILISATEUR:
${interpreted}`;

      const jobContext = {
        analysisId: String(data.id),
        conversationId: conversationIdTrimmed,
        report: reportContext,
        history,
      };

      // ✅ MODIF UNIQUE: pousser analysisId dans le job + conversationId garanti
      const job = await aiQueue.add(
        "ai-task",
        {
          type: "expert",
          userId: req.user.id,
          prompt: finalPrompt,
          context: jobContext,
          conversationId: conversationIdTrimmed,
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
        conversationId: conversationIdTrimmed,
      });
    } catch (error: unknown) {
      logger.error("[EXPERT-ROUTE] /chat failed", {
        message: error instanceof Error ? error.message : String(error),
      });

      return sendError(req, res, 500, "internal_error", "Internal Server Error");
    }
  }
);

export default router;