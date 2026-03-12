// apps/backend/src/controllers/invoices.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../utils/httpError";
import { requireUser } from "../utils/requireUser";
import { InvoicesService } from "../services/invoices.service";

const InvoiceIdSchema = z.string().uuid();

export class InvoicesController {
  /**
   * POST /invoices
   * Crée une facture
   */
  static async create(req: Request, res: Response) {
    const user = requireUser(req);

    const invoice = await InvoicesService.createInvoice(user.id, req.body);

    return res.status(201).json({
      success: true,
      invoice,
    });
  }

  /**
   * GET /invoices
   * Liste les factures de l'utilisateur
   */
  static async list(req: Request, res: Response) {
    const user = requireUser(req);

    const invoices = await InvoicesService.listInvoices(user.id);

    return res.status(200).json({
      success: true,
      invoices,
    });
  }

  /**
   * GET /invoices/:invoiceId
   * Détail facture
   */
  static async getOne(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceId = InvoiceIdSchema.safeParse(req.params.invoiceId);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const invoice = await InvoicesService.getInvoice(user.id, invoiceId.data);

    return res.status(200).json({
      success: true,
      invoice,
    });
  }

  /**
   * PATCH /invoices/:invoiceId
   * Met à jour une facture
   */
  static async update(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceId = InvoiceIdSchema.safeParse(req.params.invoiceId);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const invoice = await InvoicesService.updateInvoice(
      user.id,
      invoiceId.data,
      req.body
    );

    return res.status(200).json({
      success: true,
      invoice,
    });
  }

  /**
   * DELETE /invoices/:invoiceId
   * Supprime une facture
   */
  static async remove(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceId = InvoiceIdSchema.safeParse(req.params.invoiceId);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    await InvoicesService.deleteInvoice(user.id, invoiceId.data);

    return res.status(200).json({
      success: true,
    });
  }

  /**
   * POST /invoices/:invoiceId/finalize
   * Finalise la facture
   */
  static async finalize(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceId = InvoiceIdSchema.safeParse(req.params.invoiceId);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const invoice = await InvoicesService.finalizeInvoice(
      user.id,
      invoiceId.data
    );

    return res.status(200).json({
      success: true,
      invoice,
    });
  }

  /**
   * POST /invoices/:invoiceId/remind
   * Enqueue une relance manuelle
   */
  static async remind(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceId = InvoiceIdSchema.safeParse(req.params.invoiceId);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const reminder = await InvoicesService.enqueueReminder(
      user.id,
      invoiceId.data
    );

    return res.status(200).json({
      success: true,
      invoiceId: invoiceId.data,
      jobId: reminder.jobId,
    });
  }

  /**
   * POST /invoices/:invoiceId/pay
   * Crée une session Stripe Checkout
   */
  static async pay(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceId = InvoiceIdSchema.safeParse(req.params.invoiceId);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const session = await InvoicesService.createPaymentSession(
      user.id,
      invoiceId.data
    );

    return res.status(200).json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  }
}