import { runAI } from "./gemini.service";

export type VisionRiskLevel = "low" | "medium" | "high";

export interface VisionAnalysis {
  workType: string;
  materials: string[];
  visibleIssues: string[];
  riskLevel: VisionRiskLevel;
  notes: string;
}

function buildVisionPrompt(): string {
  return `
Tu es un expert du bâtiment et des travaux artisanaux.

Analyse l’image fournie (chantier ou travaux) et retourne UNIQUEMENT un JSON strict,
sans texte autour, sans explication.

Le JSON DOIT respecter EXACTEMENT ce format :

{
  "workType": string,
  "materials": string[],
  "visibleIssues": string[],
  "riskLevel": "low" | "medium" | "high",
  "notes": string
}

Règles STRICTES :
- Pas de texte hors JSON
- Pas de markdown
- Pas de commentaire
- Si information inconnue, utiliser une chaîne vide ou un tableau vide
`.trim();
}

export async function analyzeImageBuffer(input: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}): Promise<VisionAnalysis> {
  const prompt = buildVisionPrompt();

  const rawText = await runAI("vision", {
    prompt,
    fileBase64: input.buffer.toString("base64"),
    mimeType: input.mimeType,
    userId: input.userId,
  });

  const cleaned = rawText
    .trim()
    .replace(/^```json/, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("VISION_JSON_PARSE_ERROR");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("VISION_INVALID_RESPONSE");
  }

  const { workType, materials, visibleIssues, riskLevel, notes } =
    parsed as Partial<VisionAnalysis>;

  if (
    typeof workType !== "string" ||
    !Array.isArray(materials) ||
    !Array.isArray(visibleIssues) ||
    !["low", "medium", "high"].includes(riskLevel as string) ||
    typeof notes !== "string"
  ) {
    throw new Error("VISION_RESPONSE_SCHEMA_ERROR");
  }

  return {
    workType,
    materials,
    visibleIssues,
    riskLevel: riskLevel as VisionRiskLevel,
    notes,
  };
}