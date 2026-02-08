import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

// Route protégée
router.get("/", authMiddleware, DashboardController.getDashboard);

export default router;
