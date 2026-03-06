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
   * Crée une facture (source de vérité ArtisanPro)
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
   * Met à jour une facture (ex: status, due_date, total_amount...)
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
   * ✅ AJOUT: POST /invoices/:invoiceId/finalize
   * Finalise la facture :
   * - vérifie qu'il y a des lignes
   * - recompute totaux côté backend (cents)
   * - status -> sent
   * - enqueue sync Pennylane
   */
  static async finalize(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceId = InvoiceIdSchema.safeParse(req.params.invoiceId);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const invoice = await InvoicesService.finalizeInvoice(user.id, invoiceId.data);

    return res.status(200).json({
      success: true,
      invoice,
    });
  }

  /**
   * ✅ AJOUT: POST /invoices/:invoiceId/pay
   * Crée une session Stripe Checkout (payment) et renvoie l'URL
   */
  static async pay(req: Request, res: Response) {
    const user = requireUser(req);

    const invoiceId = InvoiceIdSchema.safeParse(req.params.invoiceId);
    if (!invoiceId.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const session = await InvoicesService.createPaymentSession(user.id, invoiceId.data);

    return res.status(200).json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  }
}