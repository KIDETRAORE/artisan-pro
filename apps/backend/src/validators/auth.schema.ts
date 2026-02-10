import { z } from "zod";

/**
 * =========================
 * SCHÉMAS DE BASE RÉUTILISABLES
 * =========================
 */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email invalide");

const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .max(128, "Mot de passe trop long");

/**
 * =========================
 * REGISTER
 * =========================
 */
export const registerSchema = z.object({
  body: z
    .object({
      email: emailSchema,
      password: passwordSchema,
      name: z
        .string()
        .trim()
        .min(2, "Nom trop court")
        .max(100, "Nom trop long")
        .optional(),
    })
    .strict(),
});

/**
 * =========================
 * LOGIN
 * =========================
 */
export const loginSchema = z.object({
  body: z
    .object({
      email: emailSchema,
      password: z.string().min(1, "Mot de passe requis"),
    })
    .strict(),
});

/**
 * =========================
 * REFRESH TOKEN
 * =========================
 */
export const refreshSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().min(1, "Refresh token manquant"),
    })
    .strict(),
});

/**
 * =========================
 * TYPES INFÉRÉS (OPTIONNEL MAIS RECOMMANDÉ)
 * =========================
 */
export type RegisterBody = z.infer<typeof registerSchema>["body"];
export type LoginBody = z.infer<typeof loginSchema>["body"];
export type RefreshBody = z.infer<typeof refreshSchema>["body"];
