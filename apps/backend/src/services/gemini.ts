
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.ts";
import { PROMPTS } from "./prompts.ts";

/**
 * SERVICE GEMINI CENTRALISÉ - GESTION D'ERREURS RENFORCÉE
 */

const ai = new GoogleGenAI({ apiKey: env.API_KEY });

// Configuration du retry
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runAI(
  type: keyof typeof PROMPTS,
  payload: any,
  attempt: number = 0
): Promise<any> {
  const modelName = (type === 'vision') 
    ? 'gemini-2.5-flash-image' 
    : (type === 'assistant' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview');

  let contents: any;

  if (type === 'vision') {
    contents = {
      parts: [
        { 
          inlineData: { 
            data: payload, 
            mimeType: 'image/jpeg' 
          } 
        },
        { text: "Effectue l'analyse de chantier demandée dans les instructions système." }
      ]
    };
  } else {
    const textPrompt = typeof payload === 'string' ? payload : (payload.prompt || JSON.stringify(payload));
    contents = textPrompt;
  }

  try {
    const isNanoBanana = modelName.includes('gemini-2.5');

    // Appel à l'API avec Timeout de sécurité (30s)
    const response = await Promise.race([
      ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: PROMPTS[type],
          responseMimeType: (!isNanoBanana && type !== 'assistant') ? "application/json" : undefined,
          temperature: (type === 'vision') ? 0.4 : 0.7,
        },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout API Gemini")), 30000))
    ]) as any;

    const text = response.text;

    // Validation du contenu retourné
    if (!text || text.trim().length === 0) {
      // Si on a un blocage de sécurité (finishReason)
      if (response.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error("CONTENU_BLOQUE: La demande a été filtrée pour des raisons de sécurité BTP.");
      }
      throw new Error("RÉPONSE_VIDE: L'IA n'a pas pu générer de texte.");
    }

    // Parsing intelligent selon le type
    if (type !== 'assistant') {
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
      } catch (jsonErr) {
        console.warn(`[Gemini] Format JSON invalide pour ${type}. Retour brut.`);
        // Fallback : si c'est censé être du JSON mais que ça rate, on tente de renvoyer un objet minimal
        if (type === 'devis') return { items: [], totalHT: 0, error: "Formatage incomplet" };
        return text;
      }
    }

    return text;

  } catch (error: any) {
    const errorMsg = error.message || "";
    
    // LOGIQUE DE RETRY (uniquement pour les erreurs réseau ou surcharge 503/429)
    if (attempt < MAX_RETRIES && (errorMsg.includes("503") || errorMsg.includes("429") || errorMsg.includes("fetch"))) {
      console.warn(`[Gemini Retry] Tentative ${attempt + 1}/${MAX_RETRIES} pour ${type}...`);
      await sleep(RETRY_DELAY * (attempt + 1));
      return runAI(type, payload, attempt + 1);
    }

    // FALLBACKS UTILISATEUR & CLASSIFICATION
    console.error(`[Gemini Critical Error] Type: ${type} |`, error);

    if (errorMsg.includes("CONTENU_BLOQUE")) {
      throw new Error("L'IA a jugé votre demande non conforme aux règles de sécurité. Reformulez votre question sans termes sensibles.");
    }
    
    if (errorMsg.includes("429") || errorMsg.includes("quota")) {
      throw new Error("L'IA est actuellement saturée (limite globale Google). Réessayez dans quelques minutes.");
    }

    if (errorMsg.includes("Timeout")) {
      throw new Error("Le serveur IA met trop de temps à répondre. Votre connexion est peut-être instable.");
    }

    // Erreur générique propre pour le frontend
    throw new Error(`Service IA momentanément indisponible pour la fonction ${type}. Veuillez réessayer.`);
  }
}
