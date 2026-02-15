import { runAI } from "./gemini.service";

/**
 * ==============================
 * TYPES MÉTIER — ANALYSE VISION
 * ==============================
 */

export type VisionRiskLevel = "low" | "medium" | "high";

export interface VisionAnalysis {
  workType: string;
  materials: string[];
  visibleIssues: string[];
  riskLevel: VisionRiskLevel;
  notes: string;
}

/**
 * ==============================
 * PROMPT VISION — ULTRA CADRÉ
 * ==============================
 */
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
`;
}

/**
 * ==============================
 * SERVICE PRINCIPAL
 * ==============================
 */
function extractBase64(data: string): string {
  const matches = data.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid base64 image format");
  }
  return matches[2];
}

export async function analyzeImageWithVision(
  imageBuffer: Buffer
): Promise<VisionAnalysis> {
  const prompt = buildVisionPrompt();

  const rawText = await runAI("vision", {
    prompt,
    image: imageBuffer,
  });

  /**
   * Nettoyage sécurité IA (au cas où)
   */
  const cleaned = rawText.trim()
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

  const {
    workType,
    materials,
    visibleIssues,
    riskLevel,
    notes,
  } = parsed as Partial<VisionAnalysis>;

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
