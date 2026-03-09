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

/* -------------------------------------------------------------------------- */
/*                               PENNYLANE                                    */
/* -------------------------------------------------------------------------- */

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
  "/pennylane/sync",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(IntegrationsController.syncPennylane)
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

/* -------------------------------------------------------------------------- */
/*                                   ODOO                                     */
/* -------------------------------------------------------------------------- */

router.get(
  "/odoo/status",
  requirePermission(PERMISSIONS.INVOICES_READ),
  asyncHandler(IntegrationsController.odooStatus)
);

router.post(
  "/odoo/connect",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(IntegrationsController.connectOdoo)
);

router.delete(
  "/odoo/connect",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(IntegrationsController.disconnectOdoo)
);

router.post(
  "/odoo/sync",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(IntegrationsController.syncOdoo)
);

router.post(
  "/odoo/invoices/:invoiceId/resync",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(IntegrationsController.resyncOdooInvoice)
);

router.get(
  "/odoo/invoices/:invoiceId/sync-events",
  requirePermission(PERMISSIONS.INVOICES_READ),
  asyncHandler(IntegrationsController.getOdooInvoiceSyncEvents)
);

/* -------------------------------------------------------------------------- */
/*                                WEBHOOKS ERP                                */
/* -------------------------------------------------------------------------- */
/**
 * ⚠️ Pas de permissions
 * ⚠️ Pas d'auth middleware
 * Vérification via header secret dans le controller
 */

router.post(
  "/webhooks/pennylane",
  asyncHandler(IntegrationsController.pennylaneWebhook)
);

router.post(
  "/webhooks/odoo",
  asyncHandler(IntegrationsController.odooWebhook)
);

export default router;