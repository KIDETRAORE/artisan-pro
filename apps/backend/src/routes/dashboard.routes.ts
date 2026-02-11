import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { DashboardController } from "../controllers/dashboard.controller";

const router = Router();

/**
 * =========================
 * DASHBOARD
 * =========================
 * GET /dashboard
 * ➜ route protégée
 * ➜ retourne les infos du dashboard utilisateur
 */
router.get(
  "/",
  authMiddleware,
  DashboardController.getDashboard
);

export default router;
