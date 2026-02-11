import { Request, Response } from "express";

/**
 * DASHBOARD CONTROLLER
 * Centralise les données affichées sur le dashboard utilisateur
 */
export class DashboardController {
  /**
   * GET /dashboard
   * ➜ endpoint protégé (authMiddleware requis)
   */
  static async getDashboard(req: Request, res: Response) {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return res.status(200).json({
      message: "Dashboard accessible",
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
  }
}
