// apps/backend/src/routes/invoices.routes.ts
import { Router } from "express";
import type { Request } from "express";
import { asyncHandler } from "@utils/asyncHandler";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";

import { HttpError } from "../utils/httpError";
import { InvoicesService } from "../services/invoices.service";

type AuthedRequest = Request & { user?: { id: string } };

const router = Router();

router.get(
  "/",
  requirePermission(PERMISSIONS.INVOICES_READ),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const data = await InvoicesService.listInvoices(userId);
    return res.status(200).json(data);
  })
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.INVOICES_READ),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const invoiceId = String(req.params.id);
    const invoice = await InvoicesService.getInvoice(userId, invoiceId);
    return res.status(200).json(invoice);
  })
);

router.post(
  "/",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const invoice = await InvoicesService.createInvoice(userId, req.body);
    return res.status(201).json(invoice);
  })
);

router.patch(
  "/:id",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const invoiceId = String(req.params.id);
    const invoice = await InvoicesService.updateInvoice(
      userId,
      invoiceId,
      req.body
    );
    return res.status(200).json(invoice);
  })
);

router.delete(
  "/:id",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const invoiceId = String(req.params.id);
    await InvoicesService.deleteInvoice(userId, invoiceId);

    return res.status(200).json({
      success: true,
    });
  })
);

router.post(
  "/:id/remind",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const invoiceId = String(req.params.id);
    const result = await InvoicesService.enqueueReminder(userId, invoiceId);

    return res.status(200).json({
      ok: true,
      invoiceId,
      jobId: result.jobId,
    });
  })
);

router.post(
  "/:id/pay",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const invoiceId = String(req.params.id);

    const session = await InvoicesService.createPaymentSession(userId, invoiceId);

    return res.status(200).json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  })
);

router.post(
  "/:id/finalize",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const invoiceId = String(req.params.id);
    const invoice = await InvoicesService.finalizeInvoice(userId, invoiceId);

    return res.status(200).json({
      ok: true,
      invoice,
    });
  })
);

export default router;