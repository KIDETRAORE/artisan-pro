// apps/backend/src/utils/aiParser.test.ts
import { describe, expect, it } from "vitest";
import { extractJSON, validateAnalysis } from "./aiParser";

describe("aiParser", () => {
  it("JSON invalide -> throw", () => {
    const text = "Hello, je ne fournis aucun JSON ici.";
    expect(() => extractJSON(text)).toThrow();
  });

  it("JSON valide conforme -> OK", () => {
    const aiText = `
      Voici la réponse:
      \`\`\`json
      {
        "elements_visibles": ["mur", "fissure"],
        "etat_general": "Bon état",
        "anomalies": ["micro-fissures"],
        "recommandations": ["surveiller", "prendre photos"]
      }
      \`\`\`
    `;

    const jsonStr = extractJSON(aiText);
    const parsed = JSON.parse(jsonStr);

    const validated = validateAnalysis(parsed);
    expect(validated.etat_general).toBe("Bon état");
    expect(Array.isArray(validated.elements_visibles)).toBe(true);
  });
});