// apps/backend/src/services/invoiceLines.service.ts

import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export type InvoiceLineRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  line_total_cents: number;
  created_at: string;
};

const CreateInvoiceLineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  tax_rate: z.number().nonnegative(),
});

const UpdateInvoiceLineSchema = z.object({
  description: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  unit_price_cents: z.number().int().nonnegative().optional(),
  tax_rate: z.number().nonnegative().optional(),
});

function normalizeStatus(value: unknown): string {
  return String(value ?? "").toLowerCase().trim();
}

async function recomputeInvoiceTotals(invoiceId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("recompute_invoice_totals_cents", {
    p_invoice_id: invoiceId,
  });

  if (error) {
    logger.error("InvoiceLinesService.recomputeInvoiceTotals failed", {
      invoiceId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to recompute invoice totals");
  }
}

async function assertInvoiceIsDraft(invoiceId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    logger.error("InvoiceLinesService.assertInvoiceIsDraft lookup failed", {
      invoiceId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to validate invoice status");
  }

  if (!data) {
    throw new HttpError(404, "Invoice not found");
  }

  const status = normalizeStatus((data as any).status);
  if (status !== "draft") {
    throw new HttpError(
      409,
      "Invoice lines can only be edited while invoice is draft"
    );
  }
}

async function getLineWithInvoiceStatus(lineId: string): Promise<{
  invoice_id: string;
  quantity: number;
  unit_price_cents: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("invoice_id, quantity, unit_price_cents")
    .eq("id", lineId)
    .maybeSingle();

  if (error) {
    logger.error("InvoiceLinesService.getLineWithInvoiceStatus lookup failed", {
      lineId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to update invoice line");
  }

  if (!data) {
    throw new HttpError(404, "Invoice line not found");
  }

  return {
    invoice_id: String((data as any).invoice_id),
    quantity: Number((data as any).quantity ?? 0),
    unit_price_cents: Number((data as any).unit_price_cents ?? 0),
  };
}

export class InvoiceLinesService {
  static async createLine(
    invoiceId: string,
    input: unknown
  ): Promise<InvoiceLineRow> {
    const parsed = CreateInvoiceLineSchema.safeParse(input);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid invoice line payload");
    }

    await assertInvoiceIsDraft(invoiceId);

    const payload = parsed.data;

    const line_total_cents = payload.quantity * payload.unit_price_cents;

    const { data, error } = await supabaseAdmin
      .from("invoice_lines")
      .insert({
        invoice_id: invoiceId,
        description: payload.description,
        quantity: payload.quantity,
        unit_price_cents: payload.unit_price_cents,
        tax_rate: payload.tax_rate,
        line_total_cents,
      })
      .select("*")
      .single();

    if (error) {
      logger.error("InvoiceLinesService.createLine failed", {
        invoiceId,
        message: error.message,
      });

      throw new HttpError(500, "Failed to create invoice line");
    }

    await recomputeInvoiceTotals(invoiceId);

    return data as InvoiceLineRow;
  }

  static async listLines(invoiceId: string): Promise<InvoiceLineRow[]> {
    const { data, error } = await supabaseAdmin
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("InvoiceLinesService.listLines failed", {
        invoiceId,
        message: error.message,
      });

      throw new HttpError(500, "Failed to list invoice lines");
    }

    return (data ?? []) as InvoiceLineRow[];
  }

  static async updateLine(
    lineId: string,
    input: unknown
  ): Promise<InvoiceLineRow> {
    const parsed = UpdateInvoiceLineSchema.safeParse(input);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid invoice line payload");
    }

    const patch = parsed.data;

    const existing = await getLineWithInvoiceStatus(lineId);
    await assertInvoiceIsDraft(existing.invoice_id);

    const nextQuantity =
      patch.quantity !== undefined ? patch.quantity : existing.quantity;
    const nextUnitPriceCents =
      patch.unit_price_cents !== undefined
        ? patch.unit_price_cents
        : existing.unit_price_cents;

    const updatePayload: Record<string, unknown> = {
      ...patch,
      quantity: nextQuantity,
      unit_price_cents: nextUnitPriceCents,
      line_total_cents: nextQuantity * nextUnitPriceCents,
    };

    const { data, error } = await supabaseAdmin
      .from("invoice_lines")
      .update(updatePayload)
      .eq("id", lineId)
      .select("*")
      .single();

    if (error) {
      logger.error("InvoiceLinesService.updateLine failed", {
        lineId,
        message: error.message,
      });

      throw new HttpError(500, "Failed to update invoice line");
    }

    await recomputeInvoiceTotals(existing.invoice_id);

    return data as InvoiceLineRow;
  }

  static async deleteLine(lineId: string): Promise<void> {
    const existing = await getLineWithInvoiceStatus(lineId);
    await assertInvoiceIsDraft(existing.invoice_id);

    const { error } = await supabaseAdmin
      .from("invoice_lines")
      .delete()
      .eq("id", lineId);

    if (error) {
      logger.error("InvoiceLinesService.deleteLine failed", {
        lineId,
        message: error.message,
      });

      throw new HttpError(500, "Failed to delete invoice line");
    }

    await recomputeInvoiceTotals(existing.invoice_id);
  }
}