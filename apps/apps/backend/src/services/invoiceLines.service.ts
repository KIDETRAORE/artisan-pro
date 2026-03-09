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

export class InvoiceLinesService {
  static async createLine(
    invoiceId: string,
    input: unknown
  ): Promise<InvoiceLineRow> {
    const parsed = CreateInvoiceLineSchema.safeParse(input);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid invoice line payload");
    }

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

    // ✅ MODIF: recalculer line_total_cents même si on modifie seulement quantity OU unit_price_cents
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("invoice_lines")
      .select("quantity, unit_price_cents")
      .eq("id", lineId)
      .maybeSingle();

    if (existingErr) {
      logger.error("InvoiceLinesService.updateLine lookup failed", {
        lineId,
        message: existingErr.message,
      });
      throw new HttpError(500, "Failed to update invoice line");
    }

    if (!existing) {
      throw new HttpError(404, "Invoice line not found");
    }

    const nextQuantity =
      patch.quantity !== undefined ? patch.quantity : (existing as any).quantity;
    const nextUnitPriceCents =
      patch.unit_price_cents !== undefined
        ? patch.unit_price_cents
        : (existing as any).unit_price_cents;

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

    return data as InvoiceLineRow;
  }

  static async deleteLine(lineId: string): Promise<void> {
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
  }
}