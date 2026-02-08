import { AnyZodObject } from "zod";

export const validate =
  (schema: AnyZodObject) =>
  (req: any, res: any, next: any) => {
    try {
      schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (err: any) {
      return res.status(400).json({
        message: "Validation échouée",
        errors: err.errors,
      });
    }
  };
