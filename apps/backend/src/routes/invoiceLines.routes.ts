// apps/backend/src/routes/invoiceLines.routes.ts
import { Router } from "express";

import { authMiddleware } from "@middlewares/auth.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";
import { asyncHandler } from "@utils/asyncHandler";

import { InvoiceLinesController } from "@controllers/invoiceLines.controller";

const router = Router();

// Create line
router.post(
  "/invoice-lines",
  authMiddleware,
  requirePermission(PERMISSIONS.INVOICE_LINES_WRITE),
  asyncHandler(InvoiceLinesController.create)
);

// List lines
router.get(
  "/invoice-lines",
  authMiddleware,
  requirePermission(PERMISSIONS.INVOICE_LINES_READ),
  asyncHandler(InvoiceLinesController.list)
);

// Update line
router.patch(
  "/invoice-lines/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.INVOICE_LINES_WRITE),
  asyncHandler(InvoiceLinesController.update)
);

// Delete line
router.delete(
  "/invoice-lines/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.INVOICE_LINES_WRITE),
  asyncHandler(InvoiceLinesController.remove)
);

export default router;