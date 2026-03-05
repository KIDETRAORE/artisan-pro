// apps/backend/src/workers/ai.worker.ts
import { Worker, type Job } from "bullmq";
import * as XLSX from "xlsx";
import { redisOptions } from "../config/redis";
import { runAI, type AIType } from "../services/ai/gemini.service";
import { quotaService } from "../services/quota.service";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin"; // ✅ AJOUTÉ

// ✅ AJOUT: persistance conversation expert
import { appendMessage } from "../services/expertConversation.service";

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
  return "assistant";
}

function toQuotaFeature(type: unknown): string {
  const t = String(type ?? "").toLowerCase();
  return isAIType(t) ? t : "ai";
}

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
    if (!sheet) continue;

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

async function buildUserContext(uid: string) {
  const { data, error } = await supabaseAdmin.rpc("get_user_context", { uid });
  if (error) throw error;
  return data;
}

function extractAssistantText(result: unknown): string {
  if (typeof result === "string") return result;

  const r: any = result as any;
  const maybe =
    r?.text ?? r?.response ?? r?.message ?? r?.content ?? r?.result ?? null;

  if (typeof maybe === "string") return maybe;

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

// ✅ AJOUT UNIQUE : normaliser la sortie assistant quand Gemini renvoie { "response": "..." }
function normalizeAssistantOutput(text: string): string {
  const t = text.trim();

  try {
    const parsed = JSON.parse(t);

    if ((parsed as any)?.response) return String((parsed as any).response);
    if ((parsed as any)?.text) return String((parsed as any).text);
  } catch {}

  return text;
}

// ✅ AJOUT UNIQUE : Output Sanitizer (anti JSON / anti markdown)
function sanitizeAssistantOutput(text: string): string {
  let t = text.trim();

  // enlever markdown code blocks
  t = t.replace(/```[\s\S]*?```/g, "").trim();

  // enlever JSON wrapper (quand c'est du JSON valide)
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const parsed = JSON.parse(t);

      if ((parsed as any)?.response) t = String((parsed as any).response);
      if ((parsed as any)?.text) t = String((parsed as any).text);
    } catch {}
  }

  // ✅ MODIF UNIQUE : enlever wrapper "bizarre" du style {"Bonjour ..."} / {\"Bonjour ...\"}
  // Cas 1: {"..."} (accolades + une seule string entre guillemets, sans ":" -> pas un objet JSON)
  {
    const m = t.match(/^\{\s*"([\s\S]*)"\s*\}$/);
    if (m?.[1] && !t.includes('":')) {
      t = m[1];
    }
  }

  // Cas 2: {\"...\"} (même chose mais quotes échappés)
  if (t.startsWith('{\\\"') && t.endsWith('\\\"}')) {
    t = t.slice(3, -3);
  }

  // best-effort: dés-échapper les séquences fréquentes
  t = t.replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();

  // enlever clés style "response:" / "text:"
  t = t.replace(/"response"\s*:\s*/gi, "");
  t = t.replace(/"text"\s*:\s*/gi, "");

  return t.trim();
}

// ✅ MODIF UNIQUE : extraire tokens Gemini si présents (usageMetadata.totalTokenCount)
function extractTokensUsed(result: unknown): number | null {
  const r: any = result as any;
  const usage = r?.usageMetadata ?? r?.__usageMetadata ?? null;
  const total = usage?.totalTokenCount;

  return typeof total === "number" && Number.isFinite(total) && total > 0
    ? total
    : null;
}

/* ✅ AJOUT UNIQUE (Mode 1 Copilote): parse JSON issu d’un texte (best effort) */
function tryParseJsonFromText(text: string): unknown | null {
  const t = String(text ?? "").trim();

  if (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  ) {
    try {
      return JSON.parse(t);
    } catch {}
  }

  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }

  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(t.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  return null;
}

/* ✅ AJOUT UNIQUE (Mode 1 Copilote): générer & retourner un snapshot Copilote (JSON) */
async function buildCopilotSnapshot(params: {
  userId: string;
  report: any;
}): Promise<Record<string, unknown> | null> {
  const { userId, report } = params;

  if (!report || typeof report !== "object") return null;

  const tva = report?.tva ?? {};
  const totals = report?.totals ?? {};
  const anomalies = Array.isArray(report?.anomalies) ? report.anomalies : [];
  const topDepenses = report?.breakdown?.topDepenses ?? [];
  const topRecettes = report?.breakdown?.topRecettes ?? [];

  const official = {
    tvaAPayer:
      typeof tva?.aPayer === "number" ? Number(tva.aPayer) : undefined,
    tvaCollectee:
      typeof tva?.collectee === "number" ? Number(tva.collectee) : undefined,
    tvaDeductible:
      typeof tva?.deductible === "number" ? Number(tva.deductible) : undefined,
    recettesHT:
      typeof totals?.recettesHT === "number"
        ? Number(totals.recettesHT)
        : undefined,
    depensesHT:
      typeof totals?.depensesHT === "number"
        ? Number(totals.depensesHT)
        : undefined,
    resultatNet:
      typeof totals?.resultatNet === "number"
        ? Number(totals.resultatNet)
        : undefined,
  };

  const prompt = `
TU ES "COPILOTE FINANCIER ARTISAN" (BTP).
Objectif: produire un snapshot court et actionnable pour mobile.

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT en JSON valide (pas de Markdown, pas de texte autour).
- N'effectue AUCUN recalcul des chiffres : copie les chiffres OFFICIAL_FIGURES tels quels.
- Si incohérence, signale-la dans alerts mais garde les chiffres OFFICIELS.
- Réponse courte (mobile): 3 alertes max, 3 actions max, 1 toCheck, 1 nextStep, 2 questions max.

FORMAT EXACT ATTENDU :
{
  "title": "Copilote financier — YYYY-MM",
  "alerts": [
    { "severity": "critical" | "warn" | "info", "label": "..." }
  ],
  "actions": ["...", "..."],
  "toCheck": "...",
  "nextStep": "...",
  "questions": ["...", "..."],
  "figures": {
    "tvaAPayer": 0,
    "tvaCollectee": 0,
    "tvaDeductible": 0,
    "recettesHT": 0,
    "depensesHT": 0,
    "resultatNet": 0
  }
}

OFFICIAL_FIGURES (SOURCE DE VÉRITÉ — À RECOPIER TEL QUEL) :
${JSON.stringify(official)}

CONTEXTE (anomalies + top postes, sans recalcul) :
${JSON.stringify(
  {
    anomalies: anomalies.slice(0, 10),
    topDepenses: Array.isArray(topDepenses) ? topDepenses.slice(0, 5) : [],
    topRecettes: Array.isArray(topRecettes) ? topRecettes.slice(0, 5) : [],
  },
  null,
  0
)}
`.trim();

  try {
    // ✅ on utilise "assistant" car runAI(expert) est en mode texte-only chez toi
    const out = await runAI("assistant" as AIType, {
      userId,
      prompt,
    });

    if (typeof out === "object" && out !== null) {
      return out as Record<string, unknown>;
    }

    if (typeof out === "string") {
      const parsed = tryParseJsonFromText(out);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    }

    return null;
  } catch (e: unknown) {
    logger.warn("[WORKER-AI] Copilot snapshot generation failed (best effort)", {
      userId,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export const aiWorker = new Worker(
  "aiQueue",
  async (job: Job) => {
    const {
      type,
      fileBase64,
      mimeType,
      userId,
      prompt,
      context: jobContext,

      // ✅ AJOUT: expert thread
      conversationId,

      // ✅ MODIF UNIQUE: si fourni, on UPDATE l’analyse existante (ai_logs) au lieu d’INSERT
      analysisId,
    } = job.data as {
      type?: unknown;
      fileBase64?: string;
      mimeType?: string;
      userId?: string;
      prompt?: string;
      context?: unknown;
      conversationId?: string;
      analysisId?: string;
    };

    if (!userId) {
      throw new Error("missing_user_id");
    }

    const jobId = String(job.id);

    const aiType = toAIType(type);
    const feature = toQuotaFeature(type);

    logger.info(`🔥 [WORKER-AI] Job ${job.id} en cours`, {
      type,
      aiType,
      feature,
      userId,
    });

    const q = await quotaService.checkQuota(userId, feature);
    if (!q.ok) {
      logger.warn("🚫 [WORKER-AI] Quota bloqué", {
        jobId: job.id,
        userId,
        feature,
        reason: (q as any).reason ?? "unknown",
      });
      throw new Error("quota_exceeded");
    }

    try {
      let rpcContext: any;

      try {
        rpcContext = await buildUserContext(userId);
      } catch (err: any) {
        logger.error("Erreur Context Builder", {
          error: err,
          userId,
          jobId,
        });

        throw new Error(
          err?.message ??
            "context_builder_failed (get_user_context missing or invalid)."
        );
      }

      void rpcContext;

      let finalPrompt = prompt;

      if (jobContext !== undefined && jobContext !== null) {
        const ctxText = (() => {
          try {
            return JSON.stringify(jobContext);
          } catch {
            return String(jobContext);
          }
        })();

        if (typeof finalPrompt === "string" && finalPrompt.trim().length > 0) {
          finalPrompt = `CONTEXTE (JSON): ${ctxText}\n\nQUESTION: ${finalPrompt}`;
        } else {
          finalPrompt = `CONTEXTE (JSON): ${ctxText}`;
        }
      }

      let finalFileBase64 = fileBase64;
      let finalMimeType = mimeType;

      if (fileBase64 && isXlsxMime(mimeType)) {
        const extracted = xlsxBase64ToPromptText(fileBase64);

        finalPrompt =
          typeof finalPrompt === "string" && finalPrompt.length > 0
            ? `${finalPrompt}\n\nDONNEES EXTRAITES DU FICHIER (JSON):\n${extracted}`
            : `DONNEES EXTRAITES DU FICHIER (JSON):\n${extracted}`;

        finalFileBase64 = undefined;
        finalMimeType = undefined;

        logger.info("📄 [WORKER-AI] XLSX converti en texte pour Gemini", {
          jobId: job.id,
          userId,
          aiType,
          feature,
        });
      }

      const result = await runAI(aiType, {
        prompt: finalPrompt,
        fileBase64: finalFileBase64,
        mimeType: finalMimeType,
        userId,
      });

      // ✅ MODIF UNIQUE : log tokens Gemini si dispo
      const tokensUsed = extractTokensUsed(result);
      if (tokensUsed != null) {
        logger.info("[WORKER-AI] Gemini tokens used", {
          jobId,
          userId,
          aiType,
          feature,
          tokensUsed,
        });
      }

      // ✅ MODIF UNIQUE (BEST EFFORT): recordUsage ne doit JAMAIS bloquer la suite
      try {
        const outputText = extractAssistantText(result);

        await quotaService.recordUsage(
          userId,
          feature,
          typeof prompt === "string" ? prompt : "worker-input",
          outputText,
          tokensUsed ?? undefined
        );
      } catch (e: unknown) {
        logger.warn("[WORKER-AI] recordUsage failed (best effort)", {
          jobId: job.id,
          userId,
          aiType,
          feature,
          message: e instanceof Error ? e.message : String(e),
        });
      }

      // ✅ Persister le report compta dans ai_logs.response_json
      // ✅ MODIF UNIQUE (Mode 1 Copilote): générer & stocker un snapshot copilot dans response_json.copilot
      if (aiType === "compta") {
        try {
          const targetId =
            typeof analysisId === "string" && analysisId.trim().length > 0
              ? analysisId.trim()
              : null;

          if (targetId) {
            const { error: upErr0 } = await supabaseAdmin
              .from("ai_logs")
              .update({
                feature: "compta",
                status: "completed",
                response_json: result as any,
                response: JSON.stringify(result),
              })
              .eq("id", targetId)
              .eq("user_id", userId);

            if (upErr0) throw upErr0;

            const copilot = await buildCopilotSnapshot({
              userId,
              report: result as any,
            });

            if (copilot) {
              const merged = {
                ...(result as any),
                copilot,
              };

              const { error: upErr1 } = await supabaseAdmin
                .from("ai_logs")
                .update({
                  response_json: merged as any,
                })
                .eq("id", targetId)
                .eq("user_id", userId);

              if (upErr1) {
                logger.warn("[WORKER-AI] Copilot attach failed (best effort)", {
                  jobId: job.id,
                  userId,
                  aiType,
                  message: upErr1.message,
                });
              }
            }
          } else {
            const { data: inserted, error: insertErr } = await supabaseAdmin
              .from("ai_logs")
              .insert({
                user_id: userId,
                feature: "compta",
                status: "completed",
                response_json: result as any,
                response: JSON.stringify(result),
              })
              .select("id")
              .single();

            if (insertErr) throw insertErr;

            const copilot = await buildCopilotSnapshot({
              userId,
              report: result as any,
            });

            if (copilot) {
              const merged = {
                ...(result as any),
                copilot,
              };

              const { error: upErr } = await supabaseAdmin
                .from("ai_logs")
                .update({
                  response_json: merged as any,
                })
                .eq("id", inserted.id)
                .eq("user_id", userId);

              if (upErr) {
                logger.warn("[WORKER-AI] Copilot attach failed (best effort)", {
                  jobId: job.id,
                  userId,
                  aiType,
                  message: upErr.message,
                });
              }
            }
          }
        } catch (e: unknown) {
          logger.error(
            "💥 [WORKER-AI] Impossible de sauvegarder ai_logs (compta)",
            {
              jobId: job.id,
              userId,
              message: e instanceof Error ? e.message : String(e),
            }
          );
        }
      }

      // ✅ si conversationId présent => persister la réponse assistant
      if (conversationId) {
        try {
          const raw = extractAssistantText(result);
          const normalized = normalizeAssistantOutput(raw);
          const text = sanitizeAssistantOutput(normalized);

          await appendMessage({
            conversationId: String(conversationId),
            role: "assistant",
            content: text,
          });
        } catch (e: unknown) {
          logger.error("[WORKER-AI] Failed to persist expert assistant message", {
            jobId,
            userId,
            conversationId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return result;
    } catch (e: unknown) {
      logger.error("💥 [WORKER-AI] Erreur job", {
        jobId: job.id,
        userId,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  },
  { connection: redisOptions }
);