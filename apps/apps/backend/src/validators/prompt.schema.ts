import { z } from "zod";

/**
 * Validation des prompts IA (texte)
 */
export const promptSchema = z.object({
  body: z.object({
    prompt: z
      .string()
      .min(3, "Le prompt est trop court")
      .max(10_000, "Le prompt est trop long"),
  }),
});

/**
 * Validation spécifique Vision (image base64)
 */
export const visionSchema = z.object({
  body: z.object({
    image: z
      .string()
      .min(100, "Image invalide ou vide (base64 attendu)"),
  }),
});
