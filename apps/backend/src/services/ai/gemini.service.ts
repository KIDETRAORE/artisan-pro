import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENV } from "../../config/env";
import { logger } from "../../utils/logger";
import { HttpError } from "../../utils/httpError";
import { getArtisanContext } from "./context.service";
import { PROMPTS } from "./prompts";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { v4 as uuidv4 } from "uuid";

const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY || "");

// ✅ MODIF UNIQUE : ajouter "expert"
export type AIType =
  | "assistant"
  | "devis"
  | "compta"
  | "vision"
  | "relance"
  | "vocal"
  | "expert";

export interface AIParams {
  prompt?: string;
  fileBase64?: string;
  mimeType?: string;
  userId: string;
  requestId?: string;
}

/* ✅ AJOUT UNIQUE */
function tryParseJsonFromText(text: string): unknown | null {
  const t = text.trim();

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** ✅ AJOUT UNIQUE : extrait un retryAfter (secondes) si présent dans le message Gemini */
function extractRetryAfterSeconds(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);

  const m1 = msg.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (m1?.[1]) {
    const v = Number(m1[1]);
    if (Number.isFinite(v) && v > 0) return Math.ceil(v);
  }

  const m2 = msg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (m2?.[1]) {
    const v = Number(m2[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }

  return null;
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /429/.test(msg) ||
    /Too Many Requests/i.test(msg) ||
    /quota/i.test(msg) ||
    /rate/i.test(msg) ||
    /timeout/i.test(msg) ||
    /5\d\d/.test(msg) ||
    /internal/i.test(msg) ||
    /unavailable/i.test(msg)
  );
}

/** ✅ AJOUT UNIQUE : détecte explicitement un 429 */
function isGemini429(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429/.test(msg) || /Too Many Requests/i.test(msg) || /quota/i.test(msg);
}

export async function runAI(type: AIType, payload: AIParams): Promise<any> {
  if (!ENV.GEMINI_API_KEY) {
    logger.error("GEMINI_API_KEY missing");
    throw new HttpError(500, "Configuration IA incomplète");
  }

  const artisanContext = await getArtisanContext(payload.userId);

  // ✅ MODIF UNIQUE : éviter PROMPTS[type] quand type === "expert" (clé absente)
  const promptKey: keyof typeof PROMPTS =
    type === "expert" ? "assistant" : type;

  const baseInstruction = PROMPTS[promptKey] || PROMPTS.assistant;

  const userPrompt =
    payload.prompt ||
    (type === "compta"
      ? "Analyse ce document comptable, calcule les totaux Recettes, Dépenses et TVA."
      : "Analyse de document");

  // ✅ MODIF UNIQUE : ne PAS forcer JSON pour l’expert
  const mustReturnJson = type !== "expert";

  const fullPrompt = `
${baseInstruction}

CONTEXTE DE L'ARTISAN :
${artisanContext}

DEMANDE :
${userPrompt}

${
  mustReturnJson
    ? "IMPORTANT : Réponds UNIQUEMENT au format JSON valide."
    : "IMPORTANT : Réponds en TEXTE uniquement (sans JSON)."
}
`.trim();

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // ✅ MODIF UNIQUE : Optimisation n°4 (désactiver temperature) pour expert
  // ⭐ AJOUT : limiter la longueur de réponse pour expert (mobile + -tokens)
  const generationConfig: {
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens?: number;
  } = {
    temperature: type === "expert" ? 0 : 0.1,
    topP: 1,
    topK: 32,
  };

  if (type === "expert") {
    generationConfig.maxOutputTokens = 350;
  }

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      let result;

      if (payload.fileBase64 && payload.mimeType) {
        result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                { text: fullPrompt },
                {
                  inlineData: {
                    mimeType: payload.mimeType,
                    data: payload.fileBase64,
                  },
                },
              ],
            },
          ],
          generationConfig,
        });
      } else {
        result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          generationConfig,
        });
      }

      const response = await result.response;

      // ✅ MODIF UNIQUE : récupérer usageMetadata (tokens)
      const usageMetadata = (response as any)?.usageMetadata ?? null;
      const tokensUsed =
        typeof usageMetadata?.totalTokenCount === "number"
          ? usageMetadata.totalTokenCount
          : null;

      let text = response.text().replace(/```json|```/g, "").trim();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0];

      try {
        // ✅ MODIF UNIQUE : stocker tokens_used si la colonne existe
        await supabaseAdmin.from("ai_logs").insert({
          id: uuidv4(),
          user_id: payload.userId,
          prompt: userPrompt,
          response: text,
          status: "SUCCESS",
          ...(tokensUsed != null ? { tokens_used: tokensUsed } : {}),
        });
      } catch (dbErr) {
        logger.error("DB Log Error:", dbErr);
      }

      /* ✅ inchangé : pour compta, retourner un objet JSON STRICT, sinon fail */
      if (type === "compta") {
        const parsed = tryParseJsonFromText(text);
        if (parsed !== null) {
          // ✅ MODIF UNIQUE : attacher usageMetadata sans casser le schéma compta
          if (parsed && typeof parsed === "object") {
            (parsed as any).__usageMetadata = usageMetadata ?? undefined;
          }
          return parsed;
        }

        throw new HttpError(502, "IA: JSON invalide pour ComptaReport");
      }

      // ✅ inchangé : on retourne le texte
      return text;
    } catch (error: unknown) {
      if (isGemini429(error)) {
        const retryAfterSeconds = extractRetryAfterSeconds(error);

        if (attempt < MAX_ATTEMPTS) {
          const waitSec =
            retryAfterSeconds != null ? retryAfterSeconds : 1 + attempt;
          await sleep(waitSec * 1000);
          continue;
        }

        const msg = error instanceof Error ? error.message : String(error);

        const httpErr = new HttpError(
          429,
          `Erreur IA: trop de requêtes (429). Réessaie dans ${
            retryAfterSeconds ?? "quelques"
          } secondes.`
        );
        (httpErr as any).details = {
          retryAfterSeconds: retryAfterSeconds ?? undefined,
          original: msg,
        };
        throw httpErr;
      }

      if (attempt < MAX_ATTEMPTS && isRetryableGeminiError(error)) {
        await sleep(300 * attempt);
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new HttpError(500, `Erreur IA: ${message}`);
    }
  }

  throw new HttpError(500, "Erreur IA: échec après retries");
}