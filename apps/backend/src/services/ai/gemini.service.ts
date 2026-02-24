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

  try {
    logger.info(`🤖 Tentative IA [${type}] pour user: ${payload.userId}`);

    const generationConfig = {
      temperature: 0.1,
      topP: 1,
      topK: 32,
    };

    let result;

    if (payload.fileBase64 && payload.mimeType) {
      let finalMimeType = payload.mimeType;
      if (finalMimeType === "text/csv") finalMimeType = "text/plain";

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

    return text;
  } catch (error: any) {
    logger.error(`❌ Échec Gemini: ${error.message}`);
    throw new HttpError(500, `Erreur IA: ${error.message}`);
  }
}