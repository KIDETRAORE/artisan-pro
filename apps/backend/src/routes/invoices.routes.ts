// apps/backend/src/routes/invoices.routes.ts
import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { asyncHandler } from "@utils/asyncHandler";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";

import { HttpError } from "../utils/httpError";
import { InvoicesService } from "../services/invoices.service";

type AuthedRequest = Request & { user?: { id: string } };

const InvoiceIdSchema = z.string().uuid();

const router = Router();

router.get(
  "/",
  requirePermission(PERMISSIONS.INVOICES_READ),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;

    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const invoices = await InvoicesService.listInvoices(userId);

    return res.status(200).json({
      success: true,
      invoices,
    });
  })
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.INVOICES_READ),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;

    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const invoiceId = InvoiceIdSchema.safeParse(req.params.id);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const invoice = await InvoicesService.getInvoice(userId, invoiceId.data);

    return res.status(200).json({
      success: true,
      invoice,
    });
  })
);

router.post(
  "/",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;

    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const invoice = await InvoicesService.createInvoice(userId, req.body);

    return res.status(201).json({
      success: true,
      invoice,
    });
  })
);

router.patch(
  "/:id",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;

    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const invoiceId = InvoiceIdSchema.safeParse(req.params.id);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const invoice = await InvoicesService.updateInvoice(
      userId,
      invoiceId.data,
      req.body
    );

    return res.status(200).json({
      success: true,
      invoice,
    });
  })
);

router.delete(
  "/:id",
  requirePermission(PERMISSIONS.INVOICES_WRITE),
  asyncHandler(async (req, res) => {
    const r = req as AuthedRequest;
    const userId = r.user?.id;

    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const invoiceId = InvoiceIdSchema.safeParse(req.params.id);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    await InvoicesService.deleteInvoice(userId, invoiceId.data);

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

    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const invoiceId = InvoiceIdSchema.safeParse(req.params.id);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const result = await InvoicesService.enqueueReminder(userId, invoiceId.data);

    return res.status(200).json({
      success: true,
      invoiceId: invoiceId.data,
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

    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const invoiceId = InvoiceIdSchema.safeParse(req.params.id);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const session = await InvoicesService.createPaymentSession(
      userId,
      invoiceId.data
    );

    return res.status(200).json({
      success: true,
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

    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const invoiceId = InvoiceIdSchema.safeParse(req.params.id);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const invoice = await InvoicesService.finalizeInvoice(
      userId,
      invoiceId.data
    );

    return res.status(200).json({
      success: true,
      invoice,
    });
  })
);

export default router;