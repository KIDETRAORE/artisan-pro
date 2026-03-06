// apps/backend/src/controllers/invoiceLines.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../utils/httpError";
import { requireUser } from "../utils/requireUser";
import { InvoicesService } from "../services/invoices.service";
import { InvoiceLinesService } from "../services/invoiceLines.service";

// ✅ AJOUT: queue intégration (auto-sync si invoice déjà sent)
import { integrationQueue } from "../queues/integration.queue";
import { logger } from "../utils/logger";

// ✅ AJOUT: lookup direct invoice_id (remplace InvoiceLinesService.getLine)
import { supabaseAdmin } from "../lib/supabaseAdmin";

const InvoiceIdSchema = z.string().uuid();
const LineIdSchema = z.string().uuid();

export class InvoiceLinesController {
  /**
   * POST /invoice-lines
   * Ajoute une ligne à une facture (montants en cents)
   */
  static async create(req: Request, res: Response) {
    const user = requireUser(req);

    // ✅ MODIF: invoiceId provient du body (aligné avec invoices.api.ts)
    const invoiceIdParsed = InvoiceIdSchema.safeParse(
      (req.body as any)?.invoice_id
    );
    if (!invoiceIdParsed.success) {
      throw new HttpError(400, "Invalid invoice_id");
    }
    const invoiceId = invoiceIdParsed.data;

    // ✅ Sécu: on vérifie que la facture appartient bien à l'utilisateur
    const invoice = await InvoicesService.getInvoice(user.id, invoiceId);

    const line = await InvoiceLinesService.createLine(invoiceId, req.body);

    // ✅ AJOUT: si invoice déjà "sent" => auto-sync (update côté Pennylane via worker)
    if (String(invoice.status).toLowerCase() === "sent") {
      try {
        await integrationQueue.add(
          "push_invoice",
          {
            type: "push_invoice",
            userId: user.id,
            invoiceId: invoice.id,
            provider: "pennylane",
          },
          {
            jobId: `push_invoice:pennylane:${invoice.id}`,
          }
        );
      } catch {
        logger.warn(
          "InvoiceLinesController.create enqueue integration job failed",
          {
            userId: user.id,
            invoiceId: invoice.id,
          }
        );
      }
    }

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

    // ✅ MODIF: invoiceId provient de query (aligné avec invoices.api.ts)
    const invoiceIdParsed = InvoiceIdSchema.safeParse(
      String(req.query.invoiceId ?? "")
    );
    if (!invoiceIdParsed.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }
    const invoiceId = invoiceIdParsed.data;

    // ✅ Sécu: facture appartient à l'utilisateur
    await InvoicesService.getInvoice(user.id, invoiceId);

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

    // ✅ MODIF: param = :id (aligné avec invoiceLines.routes.ts)
    const lineIdParsed = LineIdSchema.safeParse(req.params.id);
    if (!lineIdParsed.success) {
      throw new HttpError(400, "Invalid lineId");
    }
    const lineId = lineIdParsed.data;

    // ✅ MODIF UNIQUE: récupérer invoice_id via DB (car InvoiceLinesService.getLine n'existe pas)
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("invoice_lines")
      .select("invoice_id")
      .eq("id", lineId)
      .maybeSingle();

    if (existingErr) {
      logger.error("InvoiceLinesController.update invoice_lines lookup failed", {
        lineId,
        message: existingErr.message,
      });
      throw new HttpError(500, "Failed to load invoice line");
    }

    if (!existing?.invoice_id) {
      throw new HttpError(404, "Invoice line not found");
    }

    // ✅ Sécu: facture appartient à l'utilisateur
    const invoice = await InvoicesService.getInvoice(
      user.id,
      String(existing.invoice_id)
    );

    const line = await InvoiceLinesService.updateLine(lineId, req.body);

    // ✅ AJOUT: si invoice déjà "sent" => auto-sync
    if (String(invoice.status).toLowerCase() === "sent") {
      try {
        await integrationQueue.add(
          "push_invoice",
          {
            type: "push_invoice",
            userId: user.id,
            invoiceId: invoice.id,
            provider: "pennylane",
          },
          {
            jobId: `push_invoice:pennylane:${invoice.id}`,
          }
        );
      } catch {
        logger.warn(
          "InvoiceLinesController.update enqueue integration job failed",
          {
            userId: user.id,
            invoiceId: invoice.id,
          }
        );
      }
    }

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

    // ✅ MODIF: param = :id (aligné avec invoiceLines.routes.ts)
    const lineIdParsed = LineIdSchema.safeParse(req.params.id);
    if (!lineIdParsed.success) {
      throw new HttpError(400, "Invalid lineId");
    }
    const lineId = lineIdParsed.data;

    // ✅ MODIF UNIQUE: récupérer invoice_id via DB (car InvoiceLinesService.getLine n'existe pas)
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("invoice_lines")
      .select("invoice_id")
      .eq("id", lineId)
      .maybeSingle();

    if (existingErr) {
      logger.error("InvoiceLinesController.remove invoice_lines lookup failed", {
        lineId,
        message: existingErr.message,
      });
      throw new HttpError(500, "Failed to load invoice line");
    }

    if (!existing?.invoice_id) {
      throw new HttpError(404, "Invoice line not found");
    }

    // ✅ Sécu: facture appartient à l'utilisateur
    const invoice = await InvoicesService.getInvoice(
      user.id,
      String(existing.invoice_id)
    );

    await InvoiceLinesService.deleteLine(lineId);

    // ✅ AJOUT: si invoice déjà "sent" => auto-sync
    if (String(invoice.status).toLowerCase() === "sent") {
      try {
        await integrationQueue.add(
          "push_invoice",
          {
            type: "push_invoice",
            userId: user.id,
            invoiceId: invoice.id,
            provider: "pennylane",
          },
          {
            jobId: `push_invoice:pennylane:${invoice.id}`,
          }
        );
      } catch {
        logger.warn(
          "InvoiceLinesController.remove enqueue integration job failed",
          {
            userId: user.id,
            invoiceId: invoice.id,
          }
        );
      }
    }

    return res.status(200).json({
      success: true,
    });
  }
}