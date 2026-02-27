import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENV } from "../../config/env";
import { logger } from "../../utils/logger";
import { HttpError } from "../../utils/httpError";
import { getArtisanContext } from "./context.service";
import { PROMPTS } from "./prompts";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { v4 as uuidv4 } from "uuid";

const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY || "");

export type AIType =
  | "assistant"
  | "devis"
  | "compta"
  | "vision"
  | "relance"
  | "vocal";

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

export async function runAI(type: AIType, payload: AIParams): Promise<any> {
  if (!ENV.GEMINI_API_KEY) {
    logger.error("GEMINI_API_KEY missing");
    throw new HttpError(500, "Configuration IA incomplète");
  }

  const artisanContext = await getArtisanContext(payload.userId);
  const baseInstruction = PROMPTS[type] || PROMPTS.assistant;

  const userPrompt =
    payload.prompt ||
    (type === "compta"
      ? "Analyse ce document comptable, calcule les totaux Recettes, Dépenses et TVA."
      : "Analyse de document");

  const fullPrompt = `
${baseInstruction}

CONTEXTE DE L'ARTISAN :
${artisanContext}

DEMANDE :
${userPrompt}

IMPORTANT : Réponds UNIQUEMENT au format JSON valide.
`.trim();

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const generationConfig = {
    temperature: 0.1,
    topP: 1,
    topK: 32,
  };

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
      let text = response.text().replace(/```json|```/g, "").trim();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0];

      try {
        await supabaseAdmin.from("ai_logs").insert({
          id: uuidv4(),
          user_id: payload.userId,
          prompt: userPrompt,
          response: text,
          status: "SUCCESS",
        });
      } catch (dbErr) {
        logger.error("DB Log Error:", dbErr);
      }

      /* ✅ MODIF UNIQUE : pour compta, retourner un objet JSON si possible */
      if (type === "compta") {
        const parsed = tryParseJsonFromText(text);
        if (parsed !== null) return parsed;
      }

      return text;
    } catch (error: unknown) {
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