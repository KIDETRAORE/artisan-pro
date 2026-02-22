import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENV } from "../../config/env";
import { logger } from "../../utils/logger";
import { HttpError } from "../../utils/httpError";
import { getArtisanContext } from "./context.service";
import { PROMPTS } from "./prompts";
import { supabaseAdmin } from "../../lib/supabaseAdmin"; 
import { v4 as uuidv4 } from "uuid";

const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY || "");

/**
 * ============================
 * EXPORTS DES TYPES (PHASE 7)
 * ============================
 */
export type AIType = "assistant" | "devis" | "compta" | "vision" | "relance" | "vocal";

export interface VisionAIParams { prompt: string; image: Buffer; userId: string; }
export interface ComptaAIParams { prompt: string; userId: string; }
export interface VocalAIParams { prompt: string; audioBuffer: Buffer; mimeType: string; userId: string; }
export interface RelanceAIParams { prompt: string; userId: string; }

// Exporté pour être utilisé par ai.worker.ts
export type AIPayload = VisionAIParams | ComptaAIParams | VocalAIParams | RelanceAIParams;

/**
 * ============================
 * FONCTION PRINCIPALE RUN AI
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

  const artisanContext = await getArtisanContext(payload.userId);
  const specificInstruction = PROMPTS[type as keyof typeof PROMPTS] || PROMPTS.assistant;

  const fullPrompt = `
${specificInstruction}

CONTEXTE DE L'ARTISAN :
${artisanContext}

DEMANDE :
${payload.prompt}

IMPORTANT : Réponds uniquement au format JSON valide.
  `;

  const models = ["gemini-2.5-flash", "gemini-1.5-flash"]; 
  let lastError: any = null;

  for (const modelName of models) {
    try {
      logger.info(`🤖 Tentative IA avec le modèle : ${modelName}`);

      const model = genAI.getGenerativeModel(
        { model: modelName },
        { apiVersion: "v1" } 
      );

      const generationConfig = { temperature: 0.1 };
      let result;

      // 🔥 AJOUT TIMEOUT SÉCURISÉ (15 secondes)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT_EXCEEDED")), 15000)
      );

      // --- Exécution de la requête avec Race pour le timeout ---
      const aiCall = async () => {
        if (type === "vision" && "image" in payload) {
          return await model.generateContent({
            contents: [{ role: "user", parts: [
              { text: fullPrompt },
              { inlineData: { mimeType: "image/jpeg", data: payload.image.toString("base64") } }
            ]}],
            generationConfig
          });
        } 
        else if (type === "vocal" && "audioBuffer" in payload) {
          return await model.generateContent({
            contents: [{ role: "user", parts: [
              { text: fullPrompt },
              { inlineData: { mimeType: payload.mimeType, data: payload.audioBuffer.toString("base64") } }
            ]}],
            generationConfig
          });
        } 
        else {
          return await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullPrompt }]}],
            generationConfig
          });
        }
      };

      // On lance la course entre l'IA et le Timeout
      const aiResponse: any = await Promise.race([aiCall(), timeoutPromise]);

      const response = await aiResponse.response;
      const text = response.text();
      
      // 🔥 Extraction des tokens
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      if (!text) throw new Error("Réponse vide de l'IA");

      // --- ENREGISTREMENT ASYNC (LOGS & QUOTAS) ---
      Promise.all([
        supabaseAdmin.rpc('increment_profile_quota', { 
            user_id: payload.userId, 
            tokens: tokensUsed 
        }).then(({ error }) => { if (error) logger.error("RPC Quota Error:", error); }),

        supabaseAdmin.from('ai_usage').insert({
            id: uuidv4(),
            user_id: payload.userId,
            feature: type,
            tokens_estimated: tokensUsed
        }).then(({ error }) => { if (error) logger.error("AI Usage Insert Error:", error); }),

        supabaseAdmin.from('ai_logs').insert({
            id: uuidv4(),
            user_id: payload.userId,
            prompt: payload.prompt,
            response: text,
            status: 'SUCCESS'
        }).then(({ error }) => { if (error) logger.error("AI Logs Insert Error:", error); })
      ]).catch(err => logger.error("⚠️ Promise.all Logging Error:", err));

      logger.info(`✅ Succès avec ${modelName} (${tokensUsed} tokens)`);
      return text;

    } catch (error: any) {
      lastError = error;
      
      // Log de l'échec en DB
      supabaseAdmin.from('ai_logs').insert({
          id: uuidv4(),
          user_id: payload.userId,
          prompt: payload.prompt,
          status: 'ERROR',
          error_message: error.message
      }).then(({ error: logErr }) => {
          if (logErr) logger.error("Failed to log AI error to DB:", logErr);
      });

      // Si timeout ou erreur 429, on tente le modèle suivant
      if (error.message === "TIMEOUT_EXCEEDED" || error.message?.includes("429") || error.message?.toLowerCase().includes("not found")) {
        logger.warn(`⚠️ Échec/Timeout avec ${modelName}. Passage au suivant...`);
        continue; 
      }
      break;
    }
  }

  throw new HttpError(500, `L'IA a échoué: ${lastError?.message}`);
}