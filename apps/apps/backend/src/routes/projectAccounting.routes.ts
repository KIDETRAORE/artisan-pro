// apps/backend/src/routes/projectAccounting.routes.ts
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "@utils/asyncHandler";
import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";
import { ProjectAccountingController } from "@controllers/projectAccounting.controller";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/projects/:projectId/import-accounting",
  authMiddleware,
  requirePermission(PERMISSIONS.PROJECTS_WRITE),
  upload.single("file"),
  asyncHandler(ProjectAccountingController.importAccountingFile)
);

export default router;