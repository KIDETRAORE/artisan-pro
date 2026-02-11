import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Middleware de validation générique basé sur Zod
 *
 * ➜ Valide body / query / params
 * ➜ Remplace la valeur par la version parsée (safe & typée)
 */
export const validate =
  (
    schema: ZodSchema,
    property: "body" | "query" | "params" = "body"
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedData = schema.parse(req[property]);

      /**
       * Remplacement par les données validées
       * ➜ supprime champs inconnus
       * ➜ garantit le typage
       */
      (req as any)[property] = parsedData;

      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          message: "Erreur de validation",
          errors: err.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }

      return next(err);
    }
  };
