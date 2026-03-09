// apps/backend/src/routes/projects.routes.ts
import { Router } from "express";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { asyncHandler } from "@utils/asyncHandler";
import { PERMISSIONS } from "@auth/permissions";
import { ProjectsController } from "@controllers/projects.controller";

const router = Router();

/**
 * Monté dans routes/index.ts via :
 * router.use("/projects", authMiddleware, projectsRoutes);
 *
 * Donc ici :
 * - PAS de authMiddleware
 * - seulement les permissions + handlers
 */

// GET /projects
router.get(
  "/",
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectsController.list)
);

// POST /projects
router.post(
  "/",
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectsController.create)
);

// GET /projects/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectsController.get)
);

// PATCH /projects/:id
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectsController.update)
);

// DELETE /projects/:id
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectsController.remove)
);

// GET /projects/:id/analytics
router.get(
  "/:id/analytics",
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectsController.analytics)
);

// GET /projects/:id/insights
router.get(
  "/:id/insights",
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectsController.insights)
);

export default router;