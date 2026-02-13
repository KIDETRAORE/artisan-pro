import { ENV } from "../../config/env";

interface VisionAIParams {
  prompt: string;
  image: Buffer;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export async function runAI(
  type: "vision",
  payload: VisionAIParams
): Promise<string> {

  console.log("🚀 runAI START");

  if (!ENV.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY missing");
    throw new Error("GEMINI_API_KEY missing");
  }

  if (type !== "vision") {
    throw new Error(`Unsupported AI type: ${type}`);
  }

  // ✅ BON modèle
  const model = "gemini-2.5-flash";

  // ✅ BON endpoint (v1beta)
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const base64 = payload.image.toString("base64");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: payload.prompt },
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
