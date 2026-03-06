// apps/backend/src/routes/projects.routes.ts
import { Router } from "express";
import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";
import { asyncHandler } from "@utils/asyncHandler";
import { ProjectsController } from "@controllers/projects.controller";

const router = Router();

// GET /projects
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectsController.list)
);

// POST /projects
router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectsController.create)
);

// GET /projects/:id
router.get(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectsController.get)
);

// PATCH /projects/:id
router.patch(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectsController.update)
);

// DELETE /projects/:id
router.delete(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectsController.remove)
);

// GET /projects/:id/analytics
router.get(
  "/:id/analytics",
  authMiddleware,
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectsController.analytics)
);

// GET /projects/:id/insights
router.get(
  "/:id/insights",
  authMiddleware,
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectsController.insights)
);

export default router;