// apps/backend/src/routes/dashboard.routes.ts
import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller";
import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";
import { asyncHandler } from "@utils/asyncHandler";

const router = Router();

router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.ACCESS_DASHBOARD),
  asyncHandler(DashboardController.getDashboard)
);

export default router;