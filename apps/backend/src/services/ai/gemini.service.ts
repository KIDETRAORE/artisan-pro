import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENV } from "../../config/env";
import { logger } from "../../utils/logger";
import { HttpError } from "../../utils/httpError";
import { getArtisanContext } from "./context.service";
import { PROMPTS } from "./prompts"; // On importe tes prompts centralisés

const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY || "");

/**
 * ============================
 * TYPES & INTERFACES (Corrigés)
 * ============================
 */
// Ajout de "vocal" pour corriger l'erreur de comparaison TS
export type AIType = "assistant" | "devis" | "compta" | "vision" | "relance" | "vocal";

interface VisionAIParams {
  prompt: string;
  image: Buffer;
  userId: string;
}

interface ComptaAIParams {
  prompt: string;
  userId: string;
}

interface VocalAIParams {
  prompt: string;
  audioBuffer: Buffer;
  mimeType: string;
  userId: string;
}

type AIPayload = VisionAIParams | ComptaAIParams | VocalAIParams;

/**
 * ============================
 * RUN AI (DYNAMIQUE)
 * ============================
 */
export async function runAI(
  type: AIType,
  payload: AIPayload
): Promise<string> {

  if (!ENV.GEMINI_API_KEY) {
    logger.error("GEMINI_API_KEY missing");
    throw new HttpError(500, "Configuration IA incomplète");
  }

  // 1. Récupération du contexte métier (Artisan)
  const artisanContext = await getArtisanContext(payload.userId);

  // 2. Sélection de l'instruction système basée sur le type (DYNAMIQUE)
  // On utilise le dictionnaire PROMPTS que tu as créé dans prompts.ts
  const specificInstruction = PROMPTS[type as keyof typeof PROMPTS] || PROMPTS.assistant;

  const fullPrompt = `
${specificInstruction}

CONTEXTE DE L'ARTISAN :
${artisanContext}

DEMANDE :
${payload.prompt}

IMPORTANT : Réponds uniquement au format JSON valide.
  `;

  // 3. Liste des modèles par priorité
  const models = ["gemini-2.5-flash", "gemini-1.5-flash"]; 
  let lastError: any = null;

  for (const modelName of models) {
    try {
      logger.info(`🤖 Tentative IA avec le modèle : ${modelName}`);

      const model = genAI.getGenerativeModel(
        { model: modelName },
        { apiVersion: "v1" } 
      );

      const generationConfig = {
        temperature: 0.1,
      };

      let result;

      // 4. Gestion des flux (Vision / Vocal / Texte)
      if (type === "vision" && "image" in payload) {
        result = await model.generateContent({
          contents: [{ role: "user", parts: [
            { text: fullPrompt },
            { inlineData: { mimeType: "image/jpeg", data: payload.image.toString("base64") } }
          ]}],
          generationConfig
        });
      } 
      else if (type === "vocal" && "audioBuffer" in payload) {
        result = await model.generateContent({
          contents: [{ role: "user", parts: [
            { text: fullPrompt },
            { inlineData: { mimeType: payload.mimeType, data: payload.audioBuffer.toString("base64") } }
          ]}],
          generationConfig
        });
      } 
      else {
        result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: fullPrompt }]}],
          generationConfig
        });
      }

      const response = await result.response;
      const text = response.text();

      if (!text) throw new Error("Réponse vide de l'IA");

      logger.info(`✅ Succès avec ${modelName}`);
      return text;

    } catch (error: any) {
      lastError = error;
      const isQuotaError = error.message?.includes("429");
      const isNotFoundError = error.message?.toLowerCase().includes("not found");

      if (isQuotaError || isNotFoundError) {
        logger.warn(`⚠️ Échec avec ${modelName}. Passage au suivant...`);
        continue; 
      }
      logger.error(`❌ Erreur sur ${modelName}:`, error.message);
      break;
    }
  }

  throw new HttpError(500, `L'IA a échoué: ${lastError?.message}`);
}