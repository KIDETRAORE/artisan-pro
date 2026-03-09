import { z } from "zod";

export const ComptaBodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
});

// Optionnel (si tu utilises le type ailleurs)
export type ComptaBody = z.infer<typeof ComptaBodySchema>;