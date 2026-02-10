import { Router, Request, Response } from "express";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

/**
 * GET /devis
 * Route protégée – point d’entrée module devis
 */
router.get("/", authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  return res.status(200).json({
    message: "Module devis accessible",
    user: {
      id: user.id,
      email: user.email,
    },
    features: {
      generate: true,
      analyze: false,
      history: false,
    },
  });
});

export default router;
