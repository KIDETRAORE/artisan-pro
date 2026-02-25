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
   * Fichier en base64 + mimeType
   * (csv/pdf/image/audio…)
   */
  fileBase64?: string;
  mimeType?: string;

  userId: string;
}

/**
 * Extraction JSON "robuste":
 * - enlève fences markdown
 * - récupère soit un objet {...} soit un array [...]
 */
function extractJsonPayload(text: string): string {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return (match ? match[0] : cleaned).trim();
}

/**
 * Optionnel: normaliser certains mimetypes
 * (Gemini accepte souvent text/plain pour csv inlineData)
 */
function normalizeMimeType(mimeType: string): string {
  if (mimeType === "text/csv") return "text/plain";
  return mimeType;
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
      ? "Analyse ce document comptable (CSV). Calcule les totaux Recettes, Dépenses et TVA, et signale les anomalies."
      : "Analyse de document");

  // (si tu veux des structures strictes pour certains types)
  const jsonStructureDevis = `
Structure JSON impérative pour DEVIS/VISION/VOCAL (si pertinent) :
{
  "clientName": "string ou null",
  "totalHT": number,
  "totalTTC": number,
  "items": [{ "description": "string", "price": number }]
}`.trim();

  const fullPrompt = `
${baseInstruction}

${type === "vision" || type === "vocal" || type === "devis" ? jsonStructureDevis : ""}

CONTEXTE DE L'ARTISAN :
${artisanContext}

DEMANDE :
${userPrompt}

IMPORTANT :
- Réponds UNIQUEMENT avec un JSON valide (objet ou tableau).
- Pas de texte avant/après le JSON.
  `.trim();

  /**
   * ✅ Modèle:
   * - Stable: gemini-2.5-flash (recommandé)
   * - Alias: gemini-flash-latest (bouge avec le temps)
   */
  const modelName = ENV.GEMINI_MODEL || "gemini-2.5-flash";
  const model = genAI.getGenerativeModel({ model: modelName });

  try {
    logger.info("🤖 Tentative IA", { type, userId: payload.userId, model: modelName });

    const generationConfig = {
      temperature: 0.1,
      topP: 1,
      topK: 32,
    };

    let result;

    if (payload.fileBase64 && payload.mimeType) {
      const finalMimeType = normalizeMimeType(payload.mimeType);

      result = await model.generateContent({
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
      });
    } else {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig,
      });
    }

    const response = await result.response;
    const rawText = response.text();

    // ✅ Nettoyage + extraction JSON
    const jsonText = extractJsonPayload(rawText);

    // ✅ Logging DB (best-effort)
    try {
      await supabaseAdmin.from("ai_logs").insert({
        id: uuidv4(),
        user_id: payload.userId,
        prompt: userPrompt,  // OK, pas de secrets ici
        response: jsonText,
        status: "SUCCESS",
      });
    } catch (dbErr) {
      logger.error("DB Log Error", {
        message: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    }

    return jsonText;
  } catch (error: any) {
    // ⚠️ On évite de renvoyer un message trop verbeux côté client
    logger.error("❌ Gemini generateContent failed", {
      type,
      model: modelName,
      message: error?.message ?? String(error),
    });

    throw new HttpError(500, "Erreur IA (Gemini)");
  }
}