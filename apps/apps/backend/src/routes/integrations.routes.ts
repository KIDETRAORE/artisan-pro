// apps/backend/src/routes/integrations.routes.ts
import { Router } from "express";
import { asyncHandler } from "@utils/asyncHandler";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";
import { IntegrationsController } from "@controllers/integrations.controller";

const router = Router();

/**
 * IMPORTANT
 * Ce router est monté dans routes/index.ts via :
 *
 * router.use("/integrations", authMiddleware, integrationsRoutes);
 *
 * Donc ici :
 * - PAS de authMiddleware
 * - seulement permissions + handlers
 */

router.get(
  "/pennylane/status",
  requirePermission(PERMISSIONS.INVOICES_READ),
  asyncHandler(IntegrationsController.pennylaneStatus)
);

router.post(
  "/pennylane/connect",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(IntegrationsController.connectPennylane)
);

router.delete(
  "/pennylane/connect",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(IntegrationsController.disconnectPennylane)
);

router.post(
  "/pennylane/invoices/:invoiceId/resync",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(IntegrationsController.resyncPennylaneInvoice)
);

router.get(
  "/pennylane/invoices/:invoiceId/sync-events",
  requirePermission(PERMISSIONS.INVOICES_READ),
  asyncHandler(IntegrationsController.getPennylaneInvoiceSyncEvents)
);

export default router;