// apps/backend/src/services/salesInvoices.service.ts

import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";

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
  status: z.string().nullable(),
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
  status: SalesInvoiceStatusSchema.default("sent"),
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
  return {
    contact_id: input.contact_id ?? null,
    project_id: input.project_id ?? null,
    invoice_number: normalizeNullableString(input.invoice_number),
    issue_date: normalizeNullableString(input.issue_date),
    due_date: normalizeNullableString(input.due_date),
    subtotal_cents: input.subtotal_cents ?? 0,
    tax_cents: input.tax_cents ?? 0,
    total_cents: input.total_cents ?? 0,
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
    patch.currency = normalizeNullableString(input.currency);
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

  return patch;
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
    throw new HttpError(500, "Failed to fetch sales invoice");
  }

  if (!data) {
    return null;
  }

  return SalesInvoiceRowSchema.parse(data);
}

export class SalesInvoicesService {
  static async listSalesInvoices(userId: string): Promise<SalesInvoiceRow[]> {
    const { data, error } = await supabaseAdmin
      .from("sales_invoices")
      .select(SALES_INVOICE_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
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

    if (Object.keys(patch).length === 0) {
      return await this.getSalesInvoice(userId, salesInvoiceId);
    }

    const { error } = await supabaseAdmin
      .from("sales_invoices")
      .update(patch)
      .eq("id", salesInvoiceId)
      .eq("user_id", userId);

    if (error) {
      throw new HttpError(500, "Failed to update sales invoice");
    }

    return await this.getSalesInvoice(userId, salesInvoiceId);
  }
}