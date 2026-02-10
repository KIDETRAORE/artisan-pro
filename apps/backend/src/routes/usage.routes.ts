import { Router, Request, Response } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { quotaService } from "../services/quotaService";

const router = Router();

/**
 * GET /usage
 * Retourne l'état actuel de la consommation IA de l'utilisateur connecté.
 */
router.get(
  "/",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      if (!user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const quota = await quotaService.getUserQuota(user.id);

      if (!quota) {
        return res.status(404).json({
          message: "Données de quota non trouvées",
        });
      }

      return res.status(200).json(quota);
    } catch (error) {
      console.error("[UsageRoute Error]:", error);
      return res.status(500).json({
        message: "Erreur serveur lors de la récupération de l'usage",
      });
    }
  }
);

export default router;
