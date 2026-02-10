import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { PROMPTS } from "./prompts";

/**
 * ==============================
 * SERVICE GEMINI CENTRALISÉ
 * ==============================
 * - Vision / Assistant / Devis / Compta / Relance
 * - Retry intelligent
 * - Timeout de sécurité
 * - Parsing robuste
 */

const ai = new GoogleGenAI({
  apiKey: env.API_KEY,
});

/**
 * Retry configuration
 */
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY = 1000; // ms

const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

type AIType = keyof typeof PROMPTS;

export async function runAI(
  type: AIType,
  payload: any,
  attempt = 0
): Promise<any> {
  /**
   * Sélection du modèle
   */
  const model = type === "vision"
    ? "gemini-2.5-flash-image"
    : type === "assistant"
      ? "gemini-3-pro-preview"
      : "gemini-3-flash-preview";

  /**
   * Construction du contenu
   */
  let contents: any;

  if (type === "vision") {
    contents = {
      parts: [
        {
          inlineData: {
            data: payload,
            mimeType: "image/jpeg",
          },
        },
        {
          text: "Analyse l’image selon les instructions système.",
        },
      ],
    };
  } else {
    contents =
      typeof payload === "string"
        ? payload
        : payload?.prompt
          ? payload.prompt
          : JSON.stringify(payload);
  }

  try {
    /**
     * Timeout global 30s
     */
    const response: any = await Promise.race([
      ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: PROMPTS[type],
          responseMimeType:
            type !== "assistant" && type !== "vision"
              ? "application/json"
              : undefined,
          temperature: type === "vision" ? 0.4 : 0.7,
        },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT_GEMINI")), 30_000)
      ),
    ]);

    const text: string | undefined = response?.text;

    /**
     * Validation réponse vide / bloquée
     */
    if (!text || text.trim().length === 0) {
      const finishReason = response?.candidates?.[0]?.finishReason;

      if (finishReason === "SAFETY") {
        throw new Error("CONTENT_BLOCKED");
      }

      throw new Error("EMPTY_RESPONSE");
    }

    /**
     * Assistant → texte brut
     */
    if (type === "assistant") {
      return text;
    }

    /**
     * Parsing JSON robuste
     */
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return jsonMatch
        ? JSON.parse(jsonMatch[0])
        : JSON.parse(text);
    } catch (parseError) {
      console.warn(`[Gemini] JSON invalide pour ${type}`, text);

      if (type === "devis") {
        return {
          items: [],
          totalHT: 0,
          error: "Réponse IA partiellement exploitable",
        };
      }

      return {
        raw: text,
        warning: "Réponse non structurée",
      };
    }

  } catch (error: any) {
    const message = error?.message || "";

    /**
     * Retry ciblé (réseau / surcharge)
     */
    if (
      attempt < MAX_RETRIES &&
      (message.includes("429") ||
        message.includes("503") ||
        message.includes("fetch"))
    ) {
      console.warn(
        `[Gemini Retry] ${type} (${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(BASE_RETRY_DELAY * (attempt + 1));
      return runAI(type, payload, attempt + 1);
    }

    /**
     * Classification erreurs finales
     */
    console.error(`[Gemini Error] ${type}`, error);

    if (message === "CONTENT_BLOCKED") {
      throw new Error(
        "La demande a été bloquée par les règles de sécurité IA. Reformulez sans termes sensibles."
      );
    }

    if (message === "TIMEOUT_GEMINI") {
      throw new Error(
        "Le service IA met trop de temps à répondre. Réessayez plus tard."
      );
    }

    if (message.includes("429") || message.includes("quota")) {
      throw new Error(
        "Le service IA est temporairement saturé. Réessayez dans quelques minutes."
      );
    }

    throw new Error(
      `Service IA indisponible pour la fonctionnalité '${type}'.`
    );
  }
}
