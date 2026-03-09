// apps/backend/src/routes/clients.routes.ts
import { Router } from "express";

import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";
import { asyncHandler } from "@utils/asyncHandler";

import { ClientsController } from "@controllers/clients.controller";

const router = Router();

// Create
router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.CLIENTS_WRITE),
  asyncHandler(ClientsController.create)
);

// List
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.CLIENTS_READ),
  asyncHandler(ClientsController.list)
);

// Get one
router.get(
  "/:clientId",
  authMiddleware,
  requirePermission(PERMISSIONS.CLIENTS_READ),
  asyncHandler(ClientsController.getOne)
);

// Update
router.patch(
  "/:clientId",
  authMiddleware,
  requirePermission(PERMISSIONS.CLIENTS_WRITE),
  asyncHandler(ClientsController.update)
);

export default router;