// apps/backend/src/routes/invoices.routes.ts
import { Router } from "express";
import type { Request } from "express";
import { asyncHandler } from "@utils/asyncHandler";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";

import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { InvoicesService } from "../services/invoices.service";
import { integrationQueue } from "../queues/integration.queue";

type AuthedRequest = Request & { user?: { id: string } };

const router = Router();

async function invoiceHasLines(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("id")
    .eq("invoice_id", invoiceId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn("InvoicesRoutes.invoiceHasLines failed", {
      invoiceId,
      message: error.message,
    });
    return false;
  }

  return !!data;
}

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

    const current = await InvoicesService.getInvoice(userId, invoiceId);

    const hasLines = await invoiceHasLines(invoiceId);
    if (!hasLines) {
      throw new HttpError(400, "Impossible de finaliser une facture sans lignes");
    }

    const updated = await InvoicesService.updateInvoice(userId, invoiceId, {
      status: "sent",
    });

    try {
      await integrationQueue.add(
        "push_invoice",
        {
          type: "push_invoice",
          userId,
          invoiceId,
          provider: "pennylane",
        },
        {
          jobId: `push_invoice:pennylane:${invoiceId}`,
        }
      );
    } catch {
      logger.warn("InvoicesRoutes.finalize enqueue failed", {
        userId,
        invoiceId,
      });
    }

    return res.status(200).json({
      ok: true,
      invoice: updated,
      previousStatus: String(current.status),
    });
  })
);

export default router;