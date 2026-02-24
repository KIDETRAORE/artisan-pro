// apps/backend/src/middlewares/validate.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

type ValidatableProperty = "body" | "query" | "params";

/**
 * Middleware de validation générique basé sur Zod
 *
 * ✅ Valide body / query / params
 * ✅ Remplace req[property] par la version parsée
 * ✅ Renvoie 400 propre (sans stack) en cas d'erreur Zod
 * ✅ Pas de logs sensibles
 */
export const validate =
  <T extends z.ZodTypeAny>(schema: T, property: ValidatableProperty = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse((req as any)[property]);

    if (!result.success) {
      return res.status(400).json({
        message: "Erreur de validation",
        errors: result.error.issues.map((e) => ({
          field: e.path.length ? e.path.join(".") : property,
          message: e.message,
        })),
      });
    }

    (req as any)[property] = result.data;
    return next();
  };

/**
 * Helpers optionnels pour ZodObject (Zod v4)
 * - strict(): refuse les champs inconnus
 * - strip(): supprime les champs inconnus
 */
type AnyZodObjectCompat = z.ZodObject;

export const validateStrict =
  (schema: AnyZodObjectCompat, property: ValidatableProperty = "body") =>
    validate(schema.strict(), property);

export const validateStrip =
  (schema: AnyZodObjectCompat, property: ValidatableProperty = "body") =>
    validate(schema.strip(), property);