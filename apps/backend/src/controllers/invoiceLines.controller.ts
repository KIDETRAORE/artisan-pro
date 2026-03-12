// apps/backend/src/controllers/invoiceLines.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../utils/httpError";
import { requireUser } from "../utils/requireUser";
import { SalesInvoicesService } from "../services/salesInvoices.service";
import { InvoiceLinesService } from "../services/invoiceLines.service";
import { integrationQueue } from "../queues/integration.queue";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const InvoiceIdSchema = z.string().uuid();
const LineIdSchema = z.string().uuid();

async function getSalesInvoiceIdByLineId(lineId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("invoice_id")
    .eq("id", lineId)
    .eq("type", "sale")
    .maybeSingle();

  if (error) {
    logger.error(
      "InvoiceLinesController.getSalesInvoiceIdByLineId lookup failed",
      {
        lineId,
        message: error.message,
      }
    );
    throw new HttpError(500, "Failed to load invoice line");
  }

  const invoiceId = String(
    (data as { invoice_id?: unknown } | null)?.invoice_id ?? ""
  ).trim();

  if (!invoiceId) {
    throw new HttpError(404, "Invoice line not found");
  }

  return invoiceId;
}

async function enqueueInvoiceSyncIfSent(params: {
  userId: string;
  invoiceId: string;
  invoiceStatus: string | null;
}): Promise<void> {
  if (String(params.invoiceStatus ?? "").toLowerCase() !== "sent") {
    return;
  }

  try {
    await integrationQueue.add(
      "push_invoice",
      {
        type: "push_invoice",
        userId: params.userId,
        invoiceId: params.invoiceId,
        provider: "pennylane",
      },
      {
        jobId: `push_invoice:pennylane:${params.invoiceId}`,
      }
    );
  } catch {
    logger.warn("InvoiceLinesController enqueue integration job failed", {
      userId: params.userId,
      invoiceId: params.invoiceId,
    });
  }
}

export class InvoiceLinesController {
  /**
   * POST /invoice-lines
   * Ajoute une ligne à une facture (montants en cents)
   */
  static async create(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceIdParsed = InvoiceIdSchema.safeParse(
      (req.body as { invoice_id?: unknown } | undefined)?.invoice_id
    );

    if (!invoiceIdParsed.success) {
      throw new HttpError(400, "Invalid invoice_id");
    }

    const invoiceId = invoiceIdParsed.data;

    const invoice = await SalesInvoicesService.getSalesInvoice(
      user.id,
      invoiceId
    );
    const line = await InvoiceLinesService.createLine(invoiceId, req.body);

    await enqueueInvoiceSyncIfSent({
      userId: user.id,
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
    });

    return res.status(201).json({
      success: true,
      line,
    });
  }

  /**
   * GET /invoice-lines?invoiceId=...
   * Liste les lignes d'une facture
   */
  static async list(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceIdParsed = InvoiceIdSchema.safeParse(
      String(req.query.invoiceId ?? "")
    );

    if (!invoiceIdParsed.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const invoiceId = invoiceIdParsed.data;

    await SalesInvoicesService.getSalesInvoice(user.id, invoiceId);

    const lines = await InvoiceLinesService.listLines(invoiceId);

    return res.status(200).json({
      success: true,
      lines,
    });
  }

  /**
   * PATCH /invoice-lines/:id
   * Met à jour une ligne (cents)
   */
  static async update(req: Request, res: Response) {
    const user = requireUser(req);

    const lineIdParsed = LineIdSchema.safeParse(req.params.id);

    if (!lineIdParsed.success) {
      throw new HttpError(400, "Invalid lineId");
    }

    const lineId = lineIdParsed.data;
    const invoiceId = await getSalesInvoiceIdByLineId(lineId);

    const invoice = await SalesInvoicesService.getSalesInvoice(
      user.id,
      invoiceId
    );
    const line = await InvoiceLinesService.updateLine(lineId, req.body);

    await enqueueInvoiceSyncIfSent({
      userId: user.id,
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
    });

    return res.status(200).json({
      success: true,
      line,
    });
  }

  /**
   * DELETE /invoice-lines/:id
   * Supprime une ligne
   */
  static async remove(req: Request, res: Response) {
    const user = requireUser(req);

    const lineIdParsed = LineIdSchema.safeParse(req.params.id);

    if (!lineIdParsed.success) {
      throw new HttpError(400, "Invalid lineId");
    }

    const lineId = lineIdParsed.data;
    const invoiceId = await getSalesInvoiceIdByLineId(lineId);

    const invoice = await SalesInvoicesService.getSalesInvoice(
      user.id,
      invoiceId
    );

    await InvoiceLinesService.deleteLine(lineId);

    await enqueueInvoiceSyncIfSent({
      userId: user.id,
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
    });

    return res.status(200).json({
      success: true,
    });
  }
}