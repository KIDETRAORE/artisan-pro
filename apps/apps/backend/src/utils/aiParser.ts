/**
 * =======================
 * Extracts JSON from AI response
 * =======================
 */
export function extractJSON(text: string): string {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("AI_JSON_NOT_FOUND");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

/**
 * =======================
 * Validates Vision schema
 * =======================
 */
export function validateAnalysis(obj: any) {
  if (
    !Array.isArray(obj.elements_visibles) ||
    typeof obj.etat_general !== "string" ||
    !Array.isArray(obj.anomalies) ||
    !Array.isArray(obj.recommandations)
  ) {
    throw new Error("AI_SCHEMA_INVALID");
  }

  return obj;
}
