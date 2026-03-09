// apps/backend/src/routes/openapi.routes.ts
import { Router } from "express";
import { openApiSpec } from "../openapi/spec";

const router = Router();

router.get("/openapi.json", (_req, res) => {
  // ✅ Ne pas muter openApiSpec global : on clone puis on patch
  const spec: any =
    typeof (globalThis as any).structuredClone === "function"
      ? (globalThis as any).structuredClone(openApiSpec)
      : JSON.parse(JSON.stringify(openApiSpec));

  spec.paths = spec.paths ?? {};

  // ✅ PATCH: /ai/run (multipart/form-data)
  spec.paths["/ai/run"] = spec.paths["/ai/run"] ?? {};
  spec.paths["/ai/run"].post = spec.paths["/ai/run"].post ?? {};
  spec.paths["/ai/run"].post.requestBody = spec.paths["/ai/run"].post.requestBody ?? {
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description:
                'Type de tâche (ex: "assistant", "compta", "vision", "vocal", "devis")',
            },
            prompt: {
              type: "string",
              description: "Prompt principal (si utilisé)",
            },
            message: {
              type: "string",
              description: "Alias/compat (certains clients envoient message)",
            },
            file: {
              type: "string",
              format: "binary",
              description:
                "Fichier éventuel (audio/image/xlsx/csv...) selon le type",
            },
          },
          required: ["type"],
        },
      },
    },
  };

  // ✅ PATCH: /vision/analyze (multipart/form-data, champ image)
  spec.paths["/vision/analyze"] = spec.paths["/vision/analyze"] ?? {};
  spec.paths["/vision/analyze"].post = spec.paths["/vision/analyze"].post ?? {};
  spec.paths["/vision/analyze"].post.requestBody =
    spec.paths["/vision/analyze"].post.requestBody ?? {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              image: {
                type: "string",
                format: "binary",
                description: "Image à analyser (champ: image)",
              },
            },
            required: ["image"],
          },
        },
      },
    };

  return res.json(spec);
});

export default router;