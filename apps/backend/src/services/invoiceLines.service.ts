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

type CanonicalInvoiceLineRow = {
  id: string;
  invoice_id: string;
  type: "sale" | "purchase" | string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  created_at: string;
  unit_price_cents: number | null;
  line_total_cents: number | null;
};

const CanonicalInvoiceLineRowSchema = z.object({
  id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  type: z.string(),
  description: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  tax_rate: z.number(),
  line_total: z.number(),
  created_at: z.string(),
  unit_price_cents: z.number().nullable(),
  line_total_cents: z.number().nullable(),
});

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

function centsToUnitPrice(unitPriceCents: number): number {
  return unitPriceCents / 100;
}

function centsToLineTotal(lineTotalCents: number): number {
  return lineTotalCents / 100;
}

function fallbackCentsFromNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100);
}

function mapCanonicalLineToLegacy(row: CanonicalInvoiceLineRow): InvoiceLineRow {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    description: row.description,
    quantity: row.quantity,
    unit_price_cents:
      typeof row.unit_price_cents === "number" &&
      Number.isFinite(row.unit_price_cents)
        ? Math.round(row.unit_price_cents)
        : fallbackCentsFromNumber(row.unit_price),
    tax_rate: row.tax_rate,
    line_total_cents:
      typeof row.line_total_cents === "number" &&
      Number.isFinite(row.line_total_cents)
        ? Math.round(row.line_total_cents)
        : fallbackCentsFromNumber(row.line_total),
    created_at: row.created_at,
  };
}

async function recomputeInvoiceTotals(invoiceId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("line_total_cents, line_total, tax_rate")
    .eq("invoice_id", invoiceId)
    .eq("type", "sale");

  if (error) {
    logger.error("InvoiceLinesService.recomputeInvoiceTotals failed", {
      invoiceId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to recompute invoice totals");
  }

  const { subtotalCents, taxCents } = ((data ?? []) as Array<{
    line_total_cents?: unknown;
    line_total?: unknown;
    tax_rate?: unknown;
  }>).reduce(
    (acc, row) => {
      const lineTotalCents =
        typeof row.line_total_cents === "number" &&
        Number.isFinite(row.line_total_cents)
          ? Math.round(row.line_total_cents)
          : typeof row.line_total === "number" && Number.isFinite(row.line_total)
            ? Math.round(row.line_total * 100)
            : 0;

      const taxRate =
        typeof row.tax_rate === "number" && Number.isFinite(row.tax_rate)
          ? row.tax_rate
          : 0;

      acc.subtotalCents += lineTotalCents;
      acc.taxCents += Math.round(lineTotalCents * (taxRate / 100));

      return acc;
    },
    { subtotalCents: 0, taxCents: 0 }
  );

  const totalCents = subtotalCents + taxCents;

  const { error: updateError } = await supabaseAdmin
    .from("sales_invoices")
    .update({
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
    })
    .eq("id", invoiceId);

  if (updateError) {
    logger.error("InvoiceLinesService.recomputeInvoiceTotals update failed", {
      invoiceId,
      message: updateError.message,
    });
    throw new HttpError(500, "Failed to recompute invoice totals");
  }
}

async function assertInvoiceIsDraft(invoiceId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("sales_invoices")
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

  const status = normalizeStatus((data as { status?: unknown }).status);
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
    .select("invoice_id, quantity, unit_price_cents, unit_price, type")
    .eq("id", lineId)
    .eq("type", "sale")
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

  const row = data as {
    invoice_id?: unknown;
    quantity?: unknown;
    unit_price_cents?: unknown;
    unit_price?: unknown;
  };

  return {
    invoice_id: String(row.invoice_id ?? ""),
    quantity: Number(row.quantity ?? 0),
    unit_price_cents:
      typeof row.unit_price_cents === "number" &&
      Number.isFinite(row.unit_price_cents)
        ? Math.round(row.unit_price_cents)
        : fallbackCentsFromNumber(
            typeof row.unit_price === "number" ? row.unit_price : 0
          ),
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
    const line_total_cents = Math.round(payload.quantity * payload.unit_price_cents);

    const { data, error } = await supabaseAdmin
      .from("invoice_lines")
      .insert({
        invoice_id: invoiceId,
        type: "sale",
        description: payload.description,
        quantity: payload.quantity,
        unit_price: centsToUnitPrice(payload.unit_price_cents),
        tax_rate: payload.tax_rate,
        line_total: centsToLineTotal(line_total_cents),
        unit_price_cents: payload.unit_price_cents,
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

    return mapCanonicalLineToLegacy(
      CanonicalInvoiceLineRowSchema.parse(data)
    );
  }

  static async listLines(invoiceId: string): Promise<InvoiceLineRow[]> {
    const { data, error } = await supabaseAdmin
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("type", "sale")
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("InvoiceLinesService.listLines failed", {
        invoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list invoice lines");
    }

    return CanonicalInvoiceLineRowSchema.array()
      .parse(data ?? [])
      .map(mapCanonicalLineToLegacy);
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
    const nextLineTotalCents = Math.round(nextQuantity * nextUnitPriceCents);

    const updatePayload: Record<string, unknown> = {
      ...patch,
      quantity: nextQuantity,
      unit_price: centsToUnitPrice(nextUnitPriceCents),
      unit_price_cents: nextUnitPriceCents,
      line_total: centsToLineTotal(nextLineTotalCents),
      line_total_cents: nextLineTotalCents,
    };

    const { data, error } = await supabaseAdmin
      .from("invoice_lines")
      .update(updatePayload)
      .eq("id", lineId)
      .eq("type", "sale")
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

    return mapCanonicalLineToLegacy(
      CanonicalInvoiceLineRowSchema.parse(data)
    );
  }

  static async deleteLine(lineId: string): Promise<void> {
    const existing = await getLineWithInvoiceStatus(lineId);

    await assertInvoiceIsDraft(existing.invoice_id);

    const { error } = await supabaseAdmin
      .from("invoice_lines")
      .delete()
      .eq("id", lineId)
      .eq("type", "sale");

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