// apps/backend/src/services/salesInvoices.service.ts

import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";

export const SalesInvoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "paid",
  "partial",
  "overdue",
  "cancelled",
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
  "artisanpro",
  "compta_import",
  "sync",
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
  total_amount_cents: z.number().int().nullable(),
  currency: z.string().nullable(),
  status: z.string().nullable(),
  source_system: z.string().nullable(),
  source_external_id: z.string().nullable(),
  origin_type: z.string().nullable(),
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
  total_amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: SalesInvoiceStatusSchema.default("sent"),
  source_system: SalesInvoiceSourceSystemSchema.nullable().optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: SalesInvoiceOriginTypeSchema.default("manual"),
});

export type CreateSalesInvoiceInput = z.infer<typeof CreateSalesInvoiceSchema>;

const UpdateSalesInvoiceSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  total_amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: SalesInvoiceStatusSchema.optional(),
  source_system: SalesInvoiceSourceSystemSchema.nullable().optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: SalesInvoiceOriginTypeSchema.optional(),
});

export type UpdateSalesInvoiceInput = z.infer<typeof UpdateSalesInvoiceSchema>;

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return value ?? null;
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
    total_amount_cents: input.total_amount_cents ?? null,
    currency: normalizeNullableString(input.currency) ?? "EUR",
    status: input.status,
    source_system: input.source_system ?? null,
    source_external_id: normalizeNullableString(input.source_external_id),
    origin_type: input.origin_type,
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

  if ("total_amount_cents" in input) {
    patch.total_amount_cents = input.total_amount_cents ?? null;
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

  return patch;
}

async function readOneById(
  userId: string,
  id: string
): Promise<SalesInvoiceRow | null> {
  const { data, error } = await supabaseAdmin
    .from("sales_invoices")
    .select(
      "id, user_id, contact_id, project_id, invoice_number, issue_date, due_date, total_amount_cents, currency, status, source_system, source_external_id, origin_type, created_at, updated_at"
    )
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
      .select(
        "id, user_id, contact_id, project_id, invoice_number, issue_date, due_date, total_amount_cents, currency, status, source_system, source_external_id, origin_type, created_at, updated_at"
      )
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
      .select(
        "id, user_id, contact_id, project_id, invoice_number, issue_date, due_date, total_amount_cents, currency, status, source_system, source_external_id, origin_type, created_at, updated_at"
      )
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
      .select(
        "id, user_id, contact_id, project_id, invoice_number, issue_date, due_date, total_amount_cents, currency, status, source_system, source_external_id, origin_type, created_at, updated_at"
      )
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