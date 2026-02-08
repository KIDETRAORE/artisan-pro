import { Request, Response } from "express";

export class DashboardController {
  static async getDashboard(req: Request, res: Response) {
    const user = (req as any).user;

    return res.status(200).json({
      message: "Dashboard sécurisé",
      user,
    });
  }
}
