import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller";
import { verifySupabaseToken } from "../middlewares/verifySupabaseToken";

const router = Router();

/**
 * GET /dashboard
 * Route protégée
 */
router.get(
  "/",
  verifySupabaseToken,
  DashboardController.getDashboard
);

export default router;
