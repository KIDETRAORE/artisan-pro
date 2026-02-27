import { Worker, type Job } from "bullmq";
import * as XLSX from "xlsx";
import { redisOptions } from "../config/redis";
import { runAI, type AIType } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { logger } from "../utils/logger";

logger.info("👷 [WORKER-AI] Chargement du worker IA...");

function isAIType(x: unknown): x is AIType {
  return (
    x === "assistant" ||
    x === "devis" ||
    x === "compta" ||
    x === "vision" ||
    x === "relance" ||
    x === "vocal"
  );
}

function toAIType(type: unknown): AIType {
  const t = String(type ?? "").toLowerCase();
  if (isAIType(t)) return t;
  // fallback sûr (valeur valide de AIType)
  return "assistant";
}

/**
 * Pour le quotaService, on garde une feature string.
 * Ici, on utilise la même valeur que AIType (ou "ai" si inconnu),
 * pour rester compatible avec ton quotaService.checkQuota(feature: string).
 */
function toQuotaFeature(type: unknown): string {
  const t = String(type ?? "").toLowerCase();
  return isAIType(t) ? t : "ai";
}

/**
 * Gemini n'accepte pas le binaire XLSX en inlineData.
 * Si un XLSX est fourni, on le convertit en texte JSON et on l'injecte dans le prompt,
 * puis on ne passe plus fileBase64/mimeType à runAI.
 */
function isXlsxMime(mimeType?: string): boolean {
  const mt = String(mimeType ?? "").toLowerCase();
  return (
    mt === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mt.includes("spreadsheetml") ||
    mt.includes("application/vnd.ms-excel")
  );
}

function xlsxBase64ToPromptText(fileBase64: string): string {
  const buffer = Buffer.from(fileBase64, "base64");
  const wb = XLSX.read(buffer, { type: "buffer" });

  const MAX_SHEETS = 5;
  const MAX_ROWS_PER_SHEET = 300;

  const sheets = wb.SheetNames.slice(0, MAX_SHEETS);
  const out: Record<string, unknown[]> = {};

  for (const name of sheets) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as unknown[];
    out[name] = rows.slice(0, MAX_ROWS_PER_SHEET);
  }

  return JSON.stringify(
    {
      format: "xlsx",
      sheets,
      note:
        "Données extraites depuis un fichier XLSX. Certaines lignes peuvent être échantillonnées pour rester dans les limites de tokens.",
      data: out,
    },
    null,
    2
  );
}

/**
 * Worker dédié au traitement des tâches de la queue 'aiQueue'.
 * P1:
 * - pré-check quota avant coût IA
 * - consommation quota après succès (bloquant)
 */
export const aiWorker = new Worker(
  "aiQueue",
  async (job: Job) => {
    const { type, fileBase64, mimeType, userId, prompt } = job.data as {
      type?: unknown;
      fileBase64?: string;
      mimeType?: string;
      userId?: string;
      prompt?: string;
    };

    if (!userId) {
      throw new Error("missing_user_id");
    }

    const aiType = toAIType(type);
    const feature = toQuotaFeature(type);

    logger.info(`🔥 [WORKER-AI] Job ${job.id} en cours`, {
      type,
      aiType,
      feature,
      userId,
    });

    // ✅ Pré-check quota (évite coût IA)
    const q = await quotaService.checkQuota(userId, feature);
    if (!q.allowed) {
      logger.warn("🚫 [WORKER-AI] Quota bloqué", {
        jobId: job.id,
        userId,
        feature,
        reason: q.reason ?? "unknown",
      });
      throw new Error("quota_exceeded");
    }

    try {
      // ✅ XLSX: conversion en texte (Gemini refuse inlineData XLSX)
      let finalPrompt = prompt;
      let finalFileBase64 = fileBase64;
      let finalMimeType = mimeType;

      if (fileBase64 && isXlsxMime(mimeType)) {
        const extracted = xlsxBase64ToPromptText(fileBase64);

        finalPrompt = [
          finalPrompt ?? "",
          "\n\n---\n\n",
          "Le fichier fourni est un tableur XLSX. Voici les données extraites (JSON) :\n",
          extracted,
          "\n\n---\n\n",
          "Consignes : base-toi sur ces données extraites pour produire la réponse structurée demandée.",
        ].join("");

        // On ne passe plus de fichier à Gemini (sinon 400 Unsupported MIME type)
        finalFileBase64 = undefined;
        finalMimeType = undefined;

        logger.info("📄 [WORKER-AI] XLSX converti en texte pour Gemini", {
          jobId: job.id,
          userId,
          aiType,
          feature,
        });
      }

      // ✅ Appel IA (type strict)
      const result = await runAI(aiType, {
        prompt: finalPrompt,
        fileBase64: finalFileBase64,
        mimeType: finalMimeType,
        userId,
      });

      // ✅ Consommation quota APRÈS succès (bloquant)
      await quotaService.recordUsage(
        userId,
        feature,
        typeof prompt === "string" ? prompt : "worker-input",
        result
      );

      logger.info(`✅ [WORKER-AI] Job ${job.id} terminé avec succès.`, {
        userId,
        aiType,
        feature,
      });

      return result;
    } catch (error: unknown) {
      logger.error(`💥 [WORKER-AI] Erreur sur job ${job.id}`, {
        userId,
        aiType,
        feature,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
  {
    connection: redisOptions,
    concurrency: 2,
  }
);

aiWorker.on("completed", (job) => {
  logger.info(`✅ [WORKER-AI] Job ${job.id} completed.`);
});

aiWorker.on("failed", (job, err) => {
  logger.error(`❌ [WORKER-AI] Job ${job?.id} failed`, { message: err.message });
});