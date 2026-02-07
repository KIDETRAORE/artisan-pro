import { Router } from "express";
import { authMiddleware } from "../middleware/auth.ts";
import { quotaService } from "../services/quotaService.ts";

const router = Router();

/**
 * GET /api/usage
 * Retourne l'état actuel de la consommation IA de l'artisan.
 */
router.get("/", authMiddleware, async (req: any, res: any) => {
  try {
    const quota = await quotaService.getUserQuota(req.user.sub);
    if (!quota) {
      return res.status(404).json({ error: "Données de quota non trouvées" });
    }
    res.json(quota);
  } catch (e) {
    console.error("[UsageRoute Error]:", e);
    res.status(500).json({ error: "Erreur serveur lors de la récupération de l'usage" });
  }
});

export default router;