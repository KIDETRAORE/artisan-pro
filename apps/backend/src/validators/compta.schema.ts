import { z } from "zod";

/**
 * Validation des entrées pour l'analyse comptable IA
 */
export const comptaSchema = z.object({
  body: z.object({
    data: z
      .string()
      .min(10, "Les données comptables sont insuffisantes")
      .max(50_000, "Les données comptables sont trop volumineuses"),
  }),
});
