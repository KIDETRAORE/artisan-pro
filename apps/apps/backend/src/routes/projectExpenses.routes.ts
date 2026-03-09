// apps/backend/src/routes/projectExpenses.routes.ts
import { Router } from "express";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";
import { asyncHandler } from "@utils/asyncHandler";
import { ProjectExpensesController } from "@controllers/projectExpenses.controller";

const router = Router();

/**
 * IMPORTANT:
 * - Ce router est monté "à la racine" dans routes/index.ts
 * - Il expose des URLs stables :
 *   GET/POST   /projects/:projectId/expenses
 *   PATCH/DEL  /project-expenses/:expenseId
 */

// List expenses
router.get(
  "/projects/:projectId/expenses",
  requirePermission(PERMISSIONS.PROJECTS_READ),
  asyncHandler(ProjectExpensesController.list)
);

// Create expense
router.post(
  "/projects/:projectId/expenses",
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectExpensesController.create)
);

// Update expense
router.patch(
  "/project-expenses/:expenseId",
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectExpensesController.update)
);

// Delete expense
router.delete(
  "/project-expenses/:expenseId",
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  asyncHandler(ProjectExpensesController.remove)
);

export default router;