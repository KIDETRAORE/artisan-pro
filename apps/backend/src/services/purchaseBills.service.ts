// apps/backend/src/services/purchaseBills.service.ts

import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";

export const PurchaseBillStatusSchema = z.enum([
  "draft",
  "received",
  "partial",
  "paid",
  "overdue",
  "cancelled",
]);

export type PurchaseBillStatus = z.infer<typeof PurchaseBillStatusSchema>;

export const PurchaseBillSourceSystemSchema = z.enum([
  "artisanpro",
  "pennylane",
  "odoo",
  "file_import",
  "manual",
]);

export type PurchaseBillSourceSystem = z.infer<
  typeof PurchaseBillSourceSystemSchema
>;

export const PurchaseBillOriginTypeSchema = z.enum([
  "manual",
  "artisanpro",
  "compta_import",
  "sync",
]);

export type PurchaseBillOriginType = z.infer<
  typeof PurchaseBillOriginTypeSchema
>;

export const PurchaseBillRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable().optional(),
  bill_number: z.string().nullable(),
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

export type PurchaseBillRow = z.infer<typeof PurchaseBillRowSchema>;

const CreatePurchaseBillSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  bill_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  total_amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: PurchaseBillStatusSchema.default("received"),
  source_system: PurchaseBillSourceSystemSchema.nullable().optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: PurchaseBillOriginTypeSchema.default("manual"),
});

export type CreatePurchaseBillInput = z.infer<typeof CreatePurchaseBillSchema>;

const UpdatePurchaseBillSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  bill_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  total_amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: PurchaseBillStatusSchema.optional(),
  source_system: PurchaseBillSourceSystemSchema.nullable().optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: PurchaseBillOriginTypeSchema.optional(),
});

export type UpdatePurchaseBillInput = z.infer<typeof UpdatePurchaseBillSchema>;

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeCreateInput(input: CreatePurchaseBillInput) {
  return {
    contact_id: input.contact_id ?? null,
    project_id: input.project_id ?? null,
    bill_number: normalizeNullableString(input.bill_number),
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

function sanitizeUpdateInput(input: UpdatePurchaseBillInput) {
  const patch: Record<string, unknown> = {};

  if ("contact_id" in input) {
    patch.contact_id = input.contact_id ?? null;
  }

  if ("project_id" in input) {
    patch.project_id = input.project_id ?? null;
  }

  if ("bill_number" in input) {
    patch.bill_number = normalizeNullableString(input.bill_number);
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
): Promise<PurchaseBillRow | null> {
  const { data, error } = await supabaseAdmin
    .from("purchase_bills")
    .select(
      "id, user_id, contact_id, project_id, bill_number, issue_date, due_date, total_amount_cents, currency, status, source_system, source_external_id, origin_type, created_at, updated_at"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to fetch purchase bill");
  }

  if (!data) {
    return null;
  }

  return PurchaseBillRowSchema.parse(data);
}

export class PurchaseBillsService {
  static async listPurchaseBills(userId: string): Promise<PurchaseBillRow[]> {
    const { data, error } = await supabaseAdmin
      .from("purchase_bills")
      .select(
        "id, user_id, contact_id, project_id, bill_number, issue_date, due_date, total_amount_cents, currency, status, source_system, source_external_id, origin_type, created_at, updated_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new HttpError(500, "Failed to list purchase bills");
    }

    return PurchaseBillRowSchema.array().parse(data ?? []);
  }

  static async getPurchaseBill(
    userId: string,
    purchaseBillId: string
  ): Promise<PurchaseBillRow> {
    const row = await readOneById(userId, purchaseBillId);

    if (!row) {
      throw new HttpError(404, "Purchase bill not found");
    }

    return row;
  }

  static async findBySourceExternalId(params: {
    userId: string;
    sourceSystem: PurchaseBillSourceSystem;
    sourceExternalId: string;
  }): Promise<PurchaseBillRow | null> {
    const sourceExternalId = normalizeNullableString(params.sourceExternalId);

    if (!sourceExternalId) {
      return null;
    }

    const { data, error } = await supabaseAdmin
      .from("purchase_bills")
      .select(
        "id, user_id, contact_id, project_id, bill_number, issue_date, due_date, total_amount_cents, currency, status, source_system, source_external_id, origin_type, created_at, updated_at"
      )
      .eq("user_id", params.userId)
      .eq("source_system", params.sourceSystem)
      .eq("source_external_id", sourceExternalId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Failed to fetch purchase bill by source");
    }

    if (!data) {
      return null;
    }

    return PurchaseBillRowSchema.parse(data);
  }

  static async createPurchaseBill(
    userId: string,
    input: CreatePurchaseBillInput
  ): Promise<PurchaseBillRow> {
    const parsed = CreatePurchaseBillSchema.parse(input);
    const payload = sanitizeCreateInput(parsed);

    const { data, error } = await supabaseAdmin
      .from("purchase_bills")
      .insert({
        user_id: userId,
        ...payload,
      })
      .select(
        "id, user_id, contact_id, project_id, bill_number, issue_date, due_date, total_amount_cents, currency, status, source_system, source_external_id, origin_type, created_at, updated_at"
      )
      .single();

    if (error || !data) {
      throw new HttpError(500, "Failed to create purchase bill");
    }

    return PurchaseBillRowSchema.parse(data);
  }

  static async updatePurchaseBill(
    userId: string,
    purchaseBillId: string,
    input: UpdatePurchaseBillInput
  ): Promise<PurchaseBillRow> {
    const parsed = UpdatePurchaseBillSchema.parse(input);
    const patch = sanitizeUpdateInput(parsed);

    if (Object.keys(patch).length === 0) {
      return await this.getPurchaseBill(userId, purchaseBillId);
    }

    const { error } = await supabaseAdmin
      .from("purchase_bills")
      .update(patch)
      .eq("id", purchaseBillId)
      .eq("user_id", userId);

    if (error) {
      throw new HttpError(500, "Failed to update purchase bill");
    }

    return await this.getPurchaseBill(userId, purchaseBillId);
  }
}