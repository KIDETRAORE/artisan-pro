// apps/backend/src/services/salesInvoices.service.ts

import { z } from "zod";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { integrationQueue } from "../queues/integration.queue";
import { reminderQueue } from "../queues/reminder.queue";

export const SalesInvoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "paid",
  "overdue",
  "canceled",
]);

export type SalesInvoiceStatus = z.infer<typeof SalesInvoiceStatusSchema>;

export const SalesInvoiceSourceSystemSchema = z.enum([
  "artisanpro",
  "pennylane",
  "odoo",
  "file_import",
  "manual",
]);

export type SalesInvoiceSourceSystem = z.infer<
  typeof SalesInvoiceSourceSystemSchema
>;

export const SalesInvoiceOriginTypeSchema = z.enum([
  "manual",
  "quote",
  "compta_import",
]);

export type SalesInvoiceOriginType = z.infer<
  typeof SalesInvoiceOriginTypeSchema
>;

export const SalesInvoiceRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().nullable(),
  issue_date: z.string().nullable().optional(),
  due_date: z.string().nullable(),
  subtotal_cents: z.number().int().nullable(),
  tax_cents: z.number().int().nullable(),
  total_cents: z.number().int().nullable(),
  currency: z.string().nullable(),
  status: SalesInvoiceStatusSchema.nullable(),
  source_system: z.string().nullable(),
  source_external_id: z.string().nullable(),
  origin_type: z.string().nullable(),
  reminder_count: z.number().int().nullable().optional(),
  last_reminder_at: z.string().nullable().optional(),
  stripe_checkout_id: z.string().nullable().optional(),
  paid_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type SalesInvoiceRow = z.infer<typeof SalesInvoiceRowSchema>;

type ContactSnapshot = {
  id: string;
  name: string;
  email: string | null;
};

const CreateSalesInvoiceSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  subtotal_cents: z.number().int().nonnegative().nullable().optional(),
  tax_cents: z.number().int().nonnegative().nullable().optional(),
  total_cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: SalesInvoiceStatusSchema.default("draft"),
  source_system: SalesInvoiceSourceSystemSchema.nullable().optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: SalesInvoiceOriginTypeSchema.default("manual"),
  reminder_count: z.number().int().nonnegative().nullable().optional(),
  last_reminder_at: z.string().trim().min(1).nullable().optional(),
  stripe_checkout_id: z.string().trim().min(1).nullable().optional(),
  paid_at: z.string().trim().min(1).nullable().optional(),
});

export type CreateSalesInvoiceInput = z.infer<typeof CreateSalesInvoiceSchema>;

const UpdateSalesInvoiceSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  subtotal_cents: z.number().int().nonnegative().nullable().optional(),
  tax_cents: z.number().int().nonnegative().nullable().optional(),
  total_cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: SalesInvoiceStatusSchema.optional(),
  source_system: SalesInvoiceSourceSystemSchema.nullable().optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: SalesInvoiceOriginTypeSchema.optional(),
  reminder_count: z.number().int().nonnegative().nullable().optional(),
  last_reminder_at: z.string().trim().min(1).nullable().optional(),
  stripe_checkout_id: z.string().trim().min(1).nullable().optional(),
  paid_at: z.string().trim().min(1).nullable().optional(),
});

export type UpdateSalesInvoiceInput = z.infer<typeof UpdateSalesInvoiceSchema>;

const SALES_INVOICE_SELECT = [
  "id",
  "user_id",
  "contact_id",
  "project_id",
  "invoice_number",
  "issue_date",
  "due_date",
  "subtotal_cents",
  "tax_cents",
  "total_cents",
  "currency",
  "status",
  "source_system",
  "source_external_id",
  "origin_type",
  "reminder_count",
  "last_reminder_at",
  "stripe_checkout_id",
  "paid_at",
  "created_at",
  "updated_at",
].join(", ");

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {});

function normalizeNullableString(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeCreateInput(input: CreateSalesInvoiceInput) {
  const subtotalCents = input.subtotal_cents ?? 0;
  const taxCents = input.tax_cents ?? 0;
  const totalCents = input.total_cents ?? subtotalCents + taxCents;

  return {
    contact_id: input.contact_id ?? null,
    project_id: input.project_id ?? null,
    invoice_number: normalizeNullableString(input.invoice_number),
    issue_date: normalizeNullableString(input.issue_date),
    due_date: normalizeNullableString(input.due_date),
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    currency: normalizeNullableString(input.currency) ?? "EUR",
    status: input.status,
    source_system: input.source_system ?? null,
    source_external_id: normalizeNullableString(input.source_external_id),
    origin_type: input.origin_type,
    reminder_count: input.reminder_count ?? 0,
    last_reminder_at: normalizeNullableString(input.last_reminder_at),
    stripe_checkout_id: normalizeNullableString(input.stripe_checkout_id),
    paid_at: normalizeNullableString(input.paid_at),
  };
}

function sanitizeUpdateInput(input: UpdateSalesInvoiceInput) {
  const patch: Record<string, unknown> = {};

  if ("contact_id" in input) {
    patch.contact_id = input.contact_id ?? null;
  }

  if ("project_id" in input) {
    patch.project_id = input.project_id ?? null;
  }

  if ("invoice_number" in input) {
    patch.invoice_number = normalizeNullableString(input.invoice_number);
  }

  if ("issue_date" in input) {
    patch.issue_date = normalizeNullableString(input.issue_date);
  }

  if ("due_date" in input) {
    patch.due_date = normalizeNullableString(input.due_date);
  }

  if ("subtotal_cents" in input) {
    patch.subtotal_cents = input.subtotal_cents ?? 0;
  }

  if ("tax_cents" in input) {
    patch.tax_cents = input.tax_cents ?? 0;
  }

  if ("total_cents" in input) {
    patch.total_cents = input.total_cents ?? 0;
  }

  if ("currency" in input) {
    patch.currency = normalizeNullableString(input.currency) ?? "EUR";
  }

  if ("status" in input) {
    patch.status = input.status;
  }

  if ("source_system" in input) {
    patch.source_system = input.source_system ?? null;
  }

  if ("source_external_id" in input) {
    patch.source_external_id = normalizeNullableString(input.source_external_id);
  }

  if ("origin_type" in input) {
    patch.origin_type = input.origin_type;
  }

  if ("reminder_count" in input) {
    patch.reminder_count = input.reminder_count ?? 0;
  }

  if ("last_reminder_at" in input) {
    patch.last_reminder_at = normalizeNullableString(input.last_reminder_at);
  }

  if ("stripe_checkout_id" in input) {
    patch.stripe_checkout_id = normalizeNullableString(input.stripe_checkout_id);
  }

  if ("paid_at" in input) {
    patch.paid_at = normalizeNullableString(input.paid_at);
  }

  const nextSubtotal =
    typeof patch.subtotal_cents === "number"
      ? (patch.subtotal_cents as number)
      : undefined;
  const nextTax =
    typeof patch.tax_cents === "number"
      ? (patch.tax_cents as number)
      : undefined;
  const hasExplicitTotal = typeof patch.total_cents === "number";

  if (!hasExplicitTotal && (nextSubtotal !== undefined || nextTax !== undefined)) {
    patch.total_cents = (nextSubtotal ?? 0) + (nextTax ?? 0);
  }

  return patch;
}

function normalizeStatus(value: unknown): SalesInvoiceStatus | "" {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "draft" ||
    normalized === "sent" ||
    normalized === "paid" ||
    normalized === "overdue" ||
    normalized === "canceled"
  ) {
    return normalized;
  }

  if (normalized === "cancelled") {
    return "canceled";
  }

  return "";
}

function assertUpdateAllowed(
  currentStatus: SalesInvoiceStatus | "",
  patch: Record<string, unknown>
): void {
  if (currentStatus === "paid" || currentStatus === "canceled") {
    throw new HttpError(
      409,
      "Sales invoice is read-only in its current state"
    );
  }

  if (currentStatus === "sent" || currentStatus === "overdue") {
    const allowedFields = new Set(["contact_id", "due_date", "project_id"]);
    const patchKeys = Object.keys(patch);
    const hasForbiddenField = patchKeys.some((key) => !allowedFields.has(key));

    if (hasForbiddenField) {
      throw new HttpError(
        409,
        "Only contact_id, due_date and project_id can be edited once sales invoice is sent"
      );
    }
  }
}

async function readOneById(
  userId: string,
  id: string
): Promise<SalesInvoiceRow | null> {
  const { data, error } = await supabaseAdmin
    .from("sales_invoices")
    .select(SALES_INVOICE_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logger.error("SalesInvoicesService.readOneById failed", {
      userId,
      salesInvoiceId: id,
      message: error.message,
    });
    throw new HttpError(500, "Failed to fetch sales invoice");
  }

  if (!data) {
    return null;
  }

  return SalesInvoiceRowSchema.parse(data);
}

async function getContactSnapshot(
  userId: string,
  contactId: string | null | undefined
): Promise<ContactSnapshot | null> {
  if (!contactId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email")
    .eq("id", contactId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logger.error("SalesInvoicesService.getContactSnapshot failed", {
      userId,
      contactId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to load contact");
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    name: String(data.name ?? "").trim() || "Client",
    email: typeof data.email === "string" ? data.email : null,
  };
}

async function invoiceHasLines(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("type", "sale")
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error("SalesInvoicesService.invoiceHasLines failed", {
      invoiceId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to validate sales invoice lines");
  }

  return !!data;
}

async function recomputeSalesInvoiceTotals(
  invoiceId: string
): Promise<{ subtotalCents: number; taxCents: number; totalCents: number }> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("line_total_cents, line_total, tax_rate")
    .eq("invoice_id", invoiceId)
    .eq("type", "sale");

  if (error) {
    logger.error("SalesInvoicesService.recomputeSalesInvoiceTotals failed", {
      invoiceId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to recompute sales invoice totals");
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
    logger.error("SalesInvoicesService.recomputeSalesInvoiceTotals update failed", {
      invoiceId,
      message: updateError.message,
    });
    throw new HttpError(500, "Failed to recompute sales invoice totals");
  }

  return { subtotalCents, taxCents, totalCents };
}

async function generateInvoiceNumber(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("generate_invoice_number", {
    p_user_id: userId,
  });

  if (error) {
    logger.error("SalesInvoicesService.generateInvoiceNumber failed", {
      userId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to generate sales invoice number");
  }

  const nextInvoiceNumber = String(data ?? "").trim();

  if (!nextInvoiceNumber) {
    throw new HttpError(500, "Failed to generate sales invoice number");
  }

  return nextInvoiceNumber;
}

async function enqueuePennylanePush(params: {
  userId: string;
  invoiceId: string;
}): Promise<void> {
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
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      }
    );
  } catch {
    logger.warn("SalesInvoicesService.enqueuePennylanePush failed", {
      userId: params.userId,
      invoiceId: params.invoiceId,
    });
  }
}

export class SalesInvoicesService {
  static async listSalesInvoices(userId: string): Promise<SalesInvoiceRow[]> {
    const { data, error } = await supabaseAdmin
      .from("sales_invoices")
      .select(SALES_INVOICE_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("SalesInvoicesService.listSalesInvoices failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list sales invoices");
    }

    return SalesInvoiceRowSchema.array().parse(data ?? []);
  }

  static async getSalesInvoice(
    userId: string,
    salesInvoiceId: string
  ): Promise<SalesInvoiceRow> {
    const row = await readOneById(userId, salesInvoiceId);

    if (!row) {
      throw new HttpError(404, "Sales invoice not found");
    }

    return row;
  }

  static async findBySourceExternalId(params: {
    userId: string;
    sourceSystem: SalesInvoiceSourceSystem;
    sourceExternalId: string;
  }): Promise<SalesInvoiceRow | null> {
    const sourceExternalId = normalizeNullableString(params.sourceExternalId);

    if (!sourceExternalId) {
      return null;
    }

    const { data, error } = await supabaseAdmin
      .from("sales_invoices")
      .select(SALES_INVOICE_SELECT)
      .eq("user_id", params.userId)
      .eq("source_system", params.sourceSystem)
      .eq("source_external_id", sourceExternalId)
      .maybeSingle();

    if (error) {
      logger.error("SalesInvoicesService.findBySourceExternalId failed", {
        userId: params.userId,
        sourceSystem: params.sourceSystem,
        sourceExternalId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to fetch sales invoice by source");
    }

    if (!data) {
      return null;
    }

    return SalesInvoiceRowSchema.parse(data);
  }

  static async createSalesInvoice(
    userId: string,
    input: CreateSalesInvoiceInput
  ): Promise<SalesInvoiceRow> {
    const parsed = CreateSalesInvoiceSchema.parse(input);
    const payload = sanitizeCreateInput(parsed);

    const { data, error } = await supabaseAdmin
      .from("sales_invoices")
      .insert({
        user_id: userId,
        ...payload,
      })
      .select(SALES_INVOICE_SELECT)
      .single();

    if (error || !data) {
      logger.error("SalesInvoicesService.createSalesInvoice failed", {
        userId,
        message: error?.message ?? "Missing inserted row",
      });
      throw new HttpError(500, "Failed to create sales invoice");
    }

    return SalesInvoiceRowSchema.parse(data);
  }

  static async updateSalesInvoice(
    userId: string,
    salesInvoiceId: string,
    input: UpdateSalesInvoiceInput
  ): Promise<SalesInvoiceRow> {
    const parsed = UpdateSalesInvoiceSchema.parse(input);
    const patch = sanitizeUpdateInput(parsed);
    const current = await this.getSalesInvoice(userId, salesInvoiceId);
    const currentStatus = normalizeStatus(current.status);

    assertUpdateAllowed(currentStatus, patch);

    if (Object.keys(patch).length === 0) {
      return current;
    }

    const { error } = await supabaseAdmin
      .from("sales_invoices")
      .update(patch)
      .eq("id", salesInvoiceId)
      .eq("user_id", userId);

    if (error) {
      logger.error("SalesInvoicesService.updateSalesInvoice failed", {
        userId,
        salesInvoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update sales invoice");
    }

    const updated = await this.getSalesInvoice(userId, salesInvoiceId);
    const nextStatus = normalizeStatus(updated.status);
    const shouldPushPennylane =
      currentStatus !== "sent" &&
      patch.status === "sent" &&
      nextStatus === "sent";

    if (shouldPushPennylane) {
      const hasLines = await invoiceHasLines(updated.id);
      if (hasLines) {
        await enqueuePennylanePush({
          userId,
          invoiceId: updated.id,
        });
      }
    }

    return updated;
  }

  static async deleteSalesInvoice(
    userId: string,
    salesInvoiceId: string
  ): Promise<void> {
    const current = await this.getSalesInvoice(userId, salesInvoiceId);
    const currentStatus = normalizeStatus(current.status);

    if (currentStatus !== "draft") {
      throw new HttpError(409, "Only draft sales invoices can be deleted");
    }

    const { error } = await supabaseAdmin
      .from("sales_invoices")
      .delete()
      .eq("id", salesInvoiceId)
      .eq("user_id", userId);

    if (error) {
      logger.error("SalesInvoicesService.deleteSalesInvoice failed", {
        userId,
        salesInvoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to delete sales invoice");
    }
  }

  static async finalizeSalesInvoice(
    userId: string,
    salesInvoiceId: string
  ): Promise<SalesInvoiceRow> {
    const current = await this.getSalesInvoice(userId, salesInvoiceId);
    const currentStatus = normalizeStatus(current.status);

    if (currentStatus === "paid" || currentStatus === "canceled") {
      throw new HttpError(
        409,
        "Sales invoice cannot be finalized in its current state"
      );
    }

    const hasLines = await invoiceHasLines(salesInvoiceId);

    if (!hasLines) {
      throw new HttpError(400, "Cannot finalize sales invoice without lines");
    }

    const totals = await recomputeSalesInvoiceTotals(salesInvoiceId);

    let nextInvoiceNumber: string | null = null;
    if (!current.invoice_number) {
      nextInvoiceNumber = await generateInvoiceNumber(userId);
    }

    const patch: Record<string, unknown> = {
      status: "sent",
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
    };

    if (!current.issue_date) {
      patch.issue_date = new Date().toISOString();
    }

    if (nextInvoiceNumber) {
      patch.invoice_number = nextInvoiceNumber;
    }

    const { error } = await supabaseAdmin
      .from("sales_invoices")
      .update(patch)
      .eq("id", salesInvoiceId)
      .eq("user_id", userId);

    if (error) {
      logger.error("SalesInvoicesService.finalizeSalesInvoice failed", {
        userId,
        salesInvoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to finalize sales invoice");
    }

    await enqueuePennylanePush({
      userId,
      invoiceId: salesInvoiceId,
    });

    return await this.getSalesInvoice(userId, salesInvoiceId);
  }

  static async enqueueReminder(
    userId: string,
    salesInvoiceId: string
  ): Promise<{ jobId: string }> {
    const invoice = await this.getSalesInvoice(userId, salesInvoiceId);
    const status = normalizeStatus(invoice.status);

    if (status !== "sent" && status !== "overdue") {
      throw new HttpError(
        409,
        "Sales invoice cannot be reminded in its current state"
      );
    }

    const contact = await getContactSnapshot(userId, invoice.contact_id);
    const contactEmail = String(contact?.email ?? "").trim();

    if (!contactEmail) {
      throw new HttpError(400, "Contact email required for reminder");
    }

    const amountCents = invoice.total_cents ?? 0;

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new HttpError(400, "Sales invoice amount must be > 0");
    }

    const jobId = `invoice_reminder:manual:${invoice.id}`;

    try {
      await reminderQueue.add(
        "invoice_reminder",
        {
          invoiceId: invoice.id,
          userId,
        },
        {
          jobId,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const duplicateJob =
        message.toLowerCase().includes("job") &&
        message.toLowerCase().includes("exists");

      if (!duplicateJob) {
        logger.error("SalesInvoicesService.enqueueReminder failed", {
          userId,
          salesInvoiceId,
          message,
        });
        throw new HttpError(500, "Failed to enqueue sales invoice reminder");
      }
    }

    return { jobId };
  }

  static async createPaymentSession(
    userId: string,
    salesInvoiceId: string
  ): Promise<{ id: string; url: string }> {
    const invoice = await this.getSalesInvoice(userId, salesInvoiceId);
    const status = normalizeStatus(invoice.status);

    if (status === "paid" || status === "canceled") {
      throw new HttpError(
        409,
        "Sales invoice cannot be paid in its current state"
      );
    }

    const contact = await getContactSnapshot(userId, invoice.contact_id);
    const contactEmail = String(contact?.email ?? "").trim();

    if (!contactEmail) {
      throw new HttpError(400, "Contact email required for payment");
    }

    const amountCents = invoice.total_cents ?? 0;

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new HttpError(400, "Sales invoice amount must be > 0");
    }

    const frontUrl =
      String((ENV as { FRONT_URL?: string; FRONTEND_URL?: string }).FRONT_URL ??
        (ENV as { FRONT_URL?: string; FRONTEND_URL?: string }).FRONTEND_URL ??
        "").trim() || "http://localhost:5173";

    const label = invoice.invoice_number
      ? `Facture ${invoice.invoice_number}`
      : `Facture ${String(invoice.id).slice(0, 8)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: contactEmail,
      line_items: [
        {
          price_data: {
            currency: String(invoice.currency ?? "EUR").toLowerCase(),
            product_data: {
              name: label,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${frontUrl}/invoice-paid`,
      cancel_url: `${frontUrl}/sales-invoices/${invoice.id}`,
      metadata: {
        salesInvoiceId: invoice.id,
        userId,
      },
    });

    const { error } = await supabaseAdmin
      .from("sales_invoices")
      .update({
        stripe_checkout_id: session.id,
      })
      .eq("id", invoice.id)
      .eq("user_id", userId);

    if (error) {
      logger.error("SalesInvoicesService.createPaymentSession persist failed", {
        userId,
        salesInvoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to persist Stripe checkout session");
    }

    if (!session.url) {
      throw new HttpError(502, "Stripe session url missing");
    }

    return {
      id: session.id,
      url: session.url,
    };
  }
}