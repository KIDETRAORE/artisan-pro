// apps/backend/src/middlewares/validate.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

type ValidatableProperty = "body" | "query" | "params";

type ErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId?: string;
  details?: unknown;
};

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
      const requestId =
        (req.headers["x-request-id"] as string | undefined) ??
        (req as any).requestId ??
        undefined;

      const body: ErrorBody = {
        success: false,
        error: {
          code: "validation_error",
          message: "Erreur de validation",
        },
        requestId,
        details: result.error.issues.map((e) => ({
          field: e.path.length ? e.path.join(".") : property,
          message: e.message,
        })),
      };

      return res.status(400).json(body);
    }

    // ✅ MODIF UNIQUE : req.query peut être getter-only → ne pas l'assigner
    if (property === "query") {
      const q = req.query as unknown as Record<string, unknown>;

      if (q && typeof q === "object") {
        for (const k of Object.keys(q)) {
          try {
            delete (q as any)[k];
          } catch {
            // ignore
          }
        }

        try {
          Object.assign(q, result.data as any);
        } catch {
          // fallback best-effort
          (req as any).validatedQuery = result.data;
        }

        return next();
      }

      // fallback si query n'est pas un objet
      (req as any).validatedQuery = result.data;
      return next();
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