import { ENV } from "../../config/env";

/**
 * ============================
 * TYPES
 * ============================
 */

export type AIType = "vision" | "compta";

interface VisionAIParams {
  prompt: string;
  image: Buffer;
}

interface ComptaAIParams {
  prompt: string;
}

type AIPayload = VisionAIParams | ComptaAIParams;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * ============================
 * RUN AI
 * ============================
 */

export async function runAI(
  type: AIType,
  payload: AIPayload
): Promise<string> {

  console.log("🚀 runAI START");

  if (!ENV.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY missing");
    throw new Error("GEMINI_API_KEY missing");
  }

  const model = "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let body: any;

  /**
   * ============================
   * VISION MODE
   * ============================
   */
  if (type === "vision") {
    const visionPayload = payload as VisionAIParams;

    const base64 = visionPayload.image.toString("base64");

    body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: visionPayload.prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64,
              },
            },
          ],
        },
      ],
    };
  }

  /**
   * ============================
   * COMPTA MODE
   * ============================
   */
  else if (type === "compta") {
    const comptaPayload = payload as ComptaAIParams;

    body = {
      contents: [
        {
          role: "user",
          parts: [{ text: comptaPayload.prompt }],
        },
      ],
    };
  }

  else {
    throw new Error(`Unsupported AI type: ${type}`);
  }

  console.log("🌍 Calling Gemini API...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let response: Response;

  try {
    response = await fetch(
      `${endpoint}?key=${ENV.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
  } catch (error: unknown) {
    clearTimeout(timeout);

    console.error("🔥 Network error:", error);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Gemini API timeout (20s)");
    }

    throw new Error("Gemini API network error");
  }

  clearTimeout(timeout);

  console.log("📡 Gemini status:", response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("🔥 Gemini error body:", errorText);

    throw new Error(
      `Gemini API error ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as GeminiResponse;

  console.log("📦 Gemini raw response received");

  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error("❌ Empty Gemini response:", data);
    throw new Error("GEMINI_EMPTY_RESPONSE");
  }

  console.log("✅ runAI SUCCESS");

  return text;
}
