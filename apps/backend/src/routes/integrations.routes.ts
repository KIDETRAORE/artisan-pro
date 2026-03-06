// apps/backend/src/routes/integrations.routes.ts
import { Router } from "express";
import { asyncHandler } from "@utils/asyncHandler";
import { IntegrationsController } from "@controllers/integrations.controller";

const router = Router();

router.get(
  "/pennylane/status",
  asyncHandler(IntegrationsController.pennylaneStatus)
);

router.post(
  "/pennylane/connect",
  asyncHandler(IntegrationsController.connectPennylane)
);

router.delete(
  "/pennylane/connect",
  asyncHandler(IntegrationsController.disconnectPennylane)
);

router.post(
  "/pennylane/invoices/:invoiceId/resync",
  asyncHandler(IntegrationsController.resyncPennylaneInvoice)
);

router.get(
  "/pennylane/invoices/:invoiceId/sync-events",
  asyncHandler(IntegrationsController.getPennylaneInvoiceSyncEvents)
);

export default router;