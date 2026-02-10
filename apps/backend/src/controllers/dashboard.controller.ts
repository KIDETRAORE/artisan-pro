import { Request, Response } from "express";
import { quotaService } from "../services/quotaService";

/**
 * DASHBOARD CONTROLLER
 * Centralise les données de base affichées sur le dashboard utilisateur
 */
export class DashboardController {
  /**
   * GET /dashboard
   * ➜ endpoint protégé (auth middleware requis)
   * ➜ retourne les infos essentielles pour le dashboard
   */
  static async getDashboard(req: Request, res: Response) {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Récupération du quota utilisateur (IA, vision, compta, etc.)
    const quota = await quotaService.getUserQuota(user.id);

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
      },
      quota,
    });
  }
}
