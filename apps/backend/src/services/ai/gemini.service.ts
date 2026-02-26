import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENV } from "../../config/env";
import { logger } from "../../utils/logger";
import { HttpError } from "../../utils/httpError";
import { getArtisanContext } from "./context.service";
import { PROMPTS } from "./prompts";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { v4 as uuidv4 } from "uuid";

const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY || "");

export type AIType = "assistant" | "devis" | "compta" | "vision" | "relance" | "vocal";

export interface AIParams {
  prompt?: string;

  /**
   * ✅ Support fichiers (vision/vocal/pdf/csv…)
   * - image: mimeType="image/jpeg|image/png"
   * - audio: mimeType="audio/webm|audio/mpeg|audio/wav" etc.
   */
  fileBase64?: string;
  mimeType?: string;

  userId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Heuristiques sûres (sans parser des structures internes)
  return (
    /429/.test(msg) ||
    /Too Many Requests/i.test(msg) ||
    /quota/i.test(msg) ||
    /rate/i.test(msg) ||
    /timed? out/i.test(msg) ||
    /timeout/i.test(msg) ||
    /5\d\d/.test(msg) ||
    /internal/i.test(msg) ||
    /unavailable/i.test(msg)
  );
}

export async function runAI(type: AIType, payload: AIParams): Promise<string> {
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

  const jsonStructureDevis = `
Structure JSON impérative pour DEVIS/VISION :
{
  "clientName": "string ou null",
  "totalHT": number,
  "totalTTC": number,
  "items": [{ "description": "string", "price": number }]
}`;

  const fullPrompt = `
${baseInstruction}

${type === "vision" || type === "vocal" || type === "devis" ? jsonStructureDevis : ""}

CONTEXTE DE L'ARTISAN :
${artisanContext}

DEMANDE :
${userPrompt}

IMPORTANT : Réponds UNIQUEMENT au format JSON valide. Ne pas ajouter de texte avant ou après le JSON.
  `.trim();

  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const generationConfig = {
    temperature: 0.1,
    topP: 1,
    topK: 32,
  };

  const MAX_ATTEMPTS = 3; // 1 + 2 retries
  const TIMEOUT_MS = 25_000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      // ✅ Logs non sensibles
      logger.info("🤖 runAI attempt", {
        type,
        userId: payload.userId,
        attempt,
        hasFile: Boolean(payload.fileBase64 && payload.mimeType),
        mimeType: payload.mimeType ?? null,
      });

      let result;

      if (payload.fileBase64 && payload.mimeType) {
        let finalMimeType = payload.mimeType;
        if (finalMimeType === "text/csv") finalMimeType = "text/plain";

        result = await model.generateContent(
          {
            contents: [
              {
                role: "user",
                parts: [
                  { text: fullPrompt },
                  { inlineData: { mimeType: finalMimeType, data: payload.fileBase64 } },
                ],
              },
            ],
            generationConfig,
          },
          { signal: controller.signal as any }
        );
      } else {
        result = await model.generateContent(
          {
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig,
          },
          { signal: controller.signal as any }
        );
      }

      const response = await result.response;
      let text = response.text();

      text = text.replace(/```json|```/g, "").trim();

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

      clearTimeout(timeout);
      return text;
    } catch (error: unknown) {
      clearTimeout(timeout);

      const message = error instanceof Error ? error.message : String(error);

      // ✅ Logs non sensibles (pas de prompt complet, pas de base64)
      logger.error("❌ Gemini generateContent failed", {
        type,
        userId: payload.userId,
        attempt,
        message,
      });

      const retryable = isRetryableGeminiError(error);

      if (attempt < MAX_ATTEMPTS && retryable) {
        const backoffMs = 300 * attempt; // backoff court (300ms, 600ms)
        await sleep(backoffMs);
        continue;
      }

      throw new HttpError(500, `Erreur IA: ${message}`);
    }
  }

  // ne devrait jamais arriver
  throw new HttpError(500, "Erreur IA: échec après retries");
}